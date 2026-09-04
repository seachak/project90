import { NextResponse, type NextRequest } from "next/server";
import { makeThumbnail } from "@/lib/image/thumbnail";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_BUCKETS = new Set(["textures", "cutouts", "projects", "renders"]);
const PUBLIC_BUCKETS = new Set(["textures", "cutouts", "renders", "thumbnails"]);

/**
 * POST /api/upload
 * body: { bucket, path }
 * Storage 에 이미 올라간 원본을 읽어 400px WebP 썸네일을 thumbnails 버킷에 만들고 URL 을 돌려준다.
 */
export async function POST(request: NextRequest) {
  let body: { bucket?: string; path?: string; size?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { bucket, path } = body;
  const size = Math.min(1200, Math.max(64, Number(body.size) || 400));
  if (!bucket || !path || !ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "bucket / path 가 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "본인 파일만 처리할 수 있습니다." }, { status: 403 });
  }

  const { data: file, error: downloadError } = await supabase.storage.from(bucket).download(path);
  if (downloadError || !file) {
    return NextResponse.json(
      { error: `원본을 읽지 못했습니다: ${downloadError?.message ?? "unknown"}` },
      { status: 404 },
    );
  }

  try {
    const thumb = await makeThumbnail(await file.arrayBuffer(), size);
    const base = path.replace(/\.[a-z0-9]+$/i, "");
    const thumbPath = `${base}.thumb.webp`;
    const { error: uploadError } = await supabase.storage
      .from("thumbnails")
      .upload(thumbPath, thumb.buffer, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
    if (uploadError) {
      return NextResponse.json({ error: `썸네일 업로드 실패: ${uploadError.message}` }, { status: 500 });
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from("thumbnails").getPublicUrl(thumbPath);

    return NextResponse.json({
      thumbnailUrl: publicUrl,
      thumbnailPath: thumbPath,
      width: thumb.sourceWidth,
      height: thumb.sourceHeight,
      isPublicSource: PUBLIC_BUCKETS.has(bucket),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "썸네일 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
