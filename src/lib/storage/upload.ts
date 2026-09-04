/**
 * Supabase Storage 업로드 (브라우저) — 진행률 콜백 지원.
 * supabase-js 의 upload() 는 진행률을 주지 않으므로 XHR 로 REST 엔드포인트에 직접 올린다.
 */
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/env";

export type StorageBucket = "textures" | "cutouts" | "thumbnails" | "projects" | "renders";

export const PUBLIC_BUCKETS: readonly StorageBucket[] = ["textures", "cutouts", "thumbnails", "renders"];

export function publicUrl(bucket: StorageBucket, path: string): string {
  const { url } = getSupabaseEnv();
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

/** <uid>/<uuid>.<ext> — 첫 폴더가 uid 여야 RLS 소유권 판정이 된다 */
export function storagePathFor(userId: string, ext: string, prefix?: string): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return prefix ? `${userId}/${prefix}/${id}.${ext}` : `${userId}/${id}.${ext}`;
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}

export interface UploadOptions {
  bucket: StorageBucket;
  path: string;
  file: Blob;
  contentType?: string;
  upsert?: boolean;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  bucket: StorageBucket;
  path: string;
  /** 공개 버킷이면 public URL, 비공개면 null */
  publicUrl: string | null;
}

export async function uploadWithProgress(options: UploadOptions): Promise<UploadResult> {
  const { bucket, path, file, upsert = false, onProgress, signal } = options;
  const contentType = options.contentType ?? (file.type || "application/octet-stream");
  const { url, anonKey } = getSupabaseEnv();
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요합니다.");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${url}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", upsert ? "true" : "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        let message = `업로드 실패 (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
          message = body.message ?? body.error ?? message;
        } catch {
          /* ignore */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("네트워크 오류로 업로드에 실패했습니다."));
    xhr.onabort = () => reject(new DOMException("업로드가 취소되었습니다.", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });

  return {
    bucket,
    path,
    publicUrl: PUBLIC_BUCKETS.includes(bucket) ? publicUrl(bucket, path) : null,
  };
}

/** 서버 API 로 썸네일 생성 요청 (원본은 이미 Storage 에 있어야 함) */
export async function requestThumbnail(bucket: StorageBucket, path: string): Promise<{
  thumbnailUrl: string;
  width: number;
  height: number;
}> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, path }),
  });
  const body = (await res.json()) as {
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    error?: string;
  };
  if (!res.ok || !body.thumbnailUrl) throw new Error(body.error ?? "썸네일 생성에 실패했습니다.");
  return { thumbnailUrl: body.thumbnailUrl, width: body.width ?? 0, height: body.height ?? 0 };
}
