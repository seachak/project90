/**
 * 프로젝트 사진(비공개 버킷) URL 처리.
 * projects.before_url / after_url / base_url 에는 Storage 경로(<uid>/<projectId>/before.jpg)를 저장하고,
 * 화면에 보여줄 때 서명 URL 로 바꾼다. 절대 URL(http…)이면 그대로 쓴다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** 브라우저/서버 클라이언트 모두 허용 (storage 만 사용) */
interface StorageLike {
  storage: SupabaseClient["storage"];
}

export const PROJECT_BUCKET = "projects";
export const SIGNED_URL_TTL = 60 * 60; // 1시간

export function isAbsoluteUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(value) || value.startsWith("/") || value.startsWith("blob:") || value.startsWith("data:");
}

/** 원본 경로 → 썸네일 경로 (/api/upload 가 같은 버킷에 <base>.thumb.webp 로 만든다) */
export function thumbPathOf(path: string): string {
  return path.replace(/\.[a-z0-9]+$/i, "") + ".thumb.webp";
}

export async function resolveImageUrl(client: StorageLike, value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (isAbsoluteUrl(value)) return value;
  const { data, error } = await client.storage.from(PROJECT_BUCKET).createSignedUrl(value, SIGNED_URL_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

/** 여러 경로를 한 번에 서명 (목록용). 절대 URL 은 그대로 통과. */
export async function resolveImageUrls(client: StorageLike, values: (string | null | undefined)[]): Promise<(string | null)[]> {
  const paths = values.filter((v): v is string => Boolean(v) && !isAbsoluteUrl(v!));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await client.storage.from(PROJECT_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
    for (const item of data ?? []) {
      const p = item.path;
      const url = item.signedUrl;
      if (p && url && !item.error) signed.set(p, url);
    }
  }
  return values.map((v) => (!v ? null : isAbsoluteUrl(v) ? v : (signed.get(v) ?? null)));
}
