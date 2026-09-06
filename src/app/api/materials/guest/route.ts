import { NextResponse, type NextRequest } from "next/server";
import { isGuestMaterialsEnabled } from "@/lib/env";
import { makeThumbnail } from "@/lib/image/thumbnail";
import { createServiceClient } from "@/lib/supabase/server";
import type { MaterialInsert } from "@/types/material";

/**
 * 로그인 없이 자재를 등록하는 임시 경로.
 *
 * RLS(materials_write = owner_id 일치)와 Storage 정책은 그대로 두고,
 * **서버에서만** service_role 로 우회한다. service_role 키는 클라이언트 번들에 절대 들어가지 않는다.
 * `NEXT_PUBLIC_GUEST_MATERIALS` 가 켜져 있을 때만 동작하며 기본값은 꺼짐이다.
 *
 * 게스트 자재는 `owner_id = null`, `is_public = true` 로 저장한다.
 * (익명 SELECT 정책이 `is_public` 인 자재만 허용하므로, 공개가 아니면 등록해도 본인이 못 읽는다.)
 */

/** 게스트 업로드 파일 크기 상한 — 열려 있는 경로이므로 반드시 제한한다 */
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/webp", "image/jpeg", "image/avif"]);
const GUEST_PREFIX = "guest";

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}

function disabled() {
  return NextResponse.json(
    { error: "게스트 자재 등록이 꺼져 있습니다. .env.local 에 NEXT_PUBLIC_GUEST_MATERIALS=1 을 설정하고 서버를 재시작하세요." },
    { status: 403 },
  );
}

export async function POST(request: NextRequest) {
  if (!isGuestMaterialsEnabled()) return disabled();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다 (multipart/form-data 가 필요합니다)." }, { status: 400 });
  }

  const file = form.get("file");
  const raw = form.get("payload");
  if (!(file instanceof File) || typeof raw !== "string") {
    return NextResponse.json({ error: "file 과 payload 가 필요합니다." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `파일이 너무 큽니다 (최대 ${MAX_FILE_BYTES / 1024 / 1024}MB).` }, { status: 413 });
  }
  const mime = file.type || "image/png";
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: `지원하지 않는 이미지 형식입니다: ${mime}` }, { status: 415 });
  }

  let payload: Partial<MaterialInsert> & { __bucket?: string };
  try {
    payload = JSON.parse(raw) as Partial<MaterialInsert> & { __bucket?: string };
  } catch {
    return NextResponse.json({ error: "payload 가 올바른 JSON 이 아닙니다." }, { status: 400 });
  }
  if (!payload.kind || !payload.name) {
    return NextResponse.json({ error: "kind 와 name 은 필수입니다." }, { status: 400 });
  }

  const bucket = payload.__bucket === "cutouts" ? "cutouts" : "textures";
  delete payload.__bucket;

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버에 SUPABASE_SERVICE_ROLE_KEY 가 설정되어 있지 않습니다." },
      { status: 500 },
    );
  }

  const path = `${GUEST_PREFIX}/${crypto.randomUUID()}.${extensionForMime(mime)}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (uploadError) {
    return NextResponse.json({ error: `업로드 실패: ${uploadError.message}` }, { status: 500 });
  }
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  // 썸네일은 실패해도 원본으로 대체한다 (등록 자체를 막지 않는다)
  let thumbnailUrl = publicUrl;
  try {
    const thumb = await makeThumbnail(bytes, 400);
    const thumbPath = `${path.replace(/\.[a-z0-9]+$/i, "")}.thumb.webp`;
    const { error } = await supabase.storage
      .from("thumbnails")
      .upload(thumbPath, thumb.buffer, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
    if (!error) thumbnailUrl = supabase.storage.from("thumbnails").getPublicUrl(thumbPath).data.publicUrl;
  } catch (err) {
    console.warn("게스트 썸네일 생성 실패, 원본으로 대체합니다", err);
  }

  const insert: MaterialInsert = {
    ...payload,
    kind: payload.kind,
    name: payload.name,
    texture_url: bucket === "textures" ? publicUrl : null,
    cutout_url: bucket === "cutouts" ? publicUrl : null,
    thumbnail_url: thumbnailUrl,
    owner_id: null,
    is_public: true, // 익명 SELECT 는 공개 자재만 읽을 수 있다
  };

  const { data, error } = await supabase.from("materials").insert(insert).select("id").single();
  if (error) {
    // 행 저장이 실패했으면 방금 올린 파일도 지운다 (고아 파일 방지)
    await supabase.storage.from(bucket).remove([path]);
    return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, textureUrl: publicUrl, thumbnailUrl });
}

/** 게스트로 등록한 자재(owner_id 가 없는 것)만 지운다 — 임시 데이터 정리용 */
export async function DELETE(request: NextRequest) {
  if (!isGuestMaterialsEnabled()) return disabled();

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "서버 설정 오류" }, { status: 500 });
  }

  const { error } = await supabase.from("materials").delete().eq("id", id).is("owner_id", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
