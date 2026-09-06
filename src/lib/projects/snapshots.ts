/**
 * 스냅샷 저장 · 공유 링크 (Phase 9).
 *
 * 결과 PNG 는 public `renders` 버킷에 올리고, 원본 현장 사진(private `projects` 버킷)은
 * 공유 경로에 절대 노출하지 않는다. 공유 뷰어는 `get_shared_snapshot` RPC(anon 실행 허용)로
 * PNG 와 자기완결적 state 만 읽는다.
 */
import type { BrowserSupabaseClient } from "@/lib/supabase/client";
import { publicUrl } from "@/lib/storage/upload";
import type { SnapshotState } from "@/lib/projects/snapshotState";

export interface SaveSnapshotResult {
  id: string;
  shareToken: string;
  shareUrl: string;
  imageUrl: string | null;
}

/** 브라우저 기준 절대 공유 URL */
export function shareUrlFor(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/share/${token}`;
}

export async function saveSnapshot(
  supabase: BrowserSupabaseClient,
  options: { projectId: string; title: string; state: SnapshotState; png: Blob | null },
): Promise<SaveSnapshotResult> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("로그인이 필요합니다.");

  const id = crypto.randomUUID();
  let imageUrl: string | null = null;

  if (options.png) {
    const path = `${userId}/${options.projectId}/snapshots/${id}.png`;
    const { error } = await supabase.storage.from("renders").upload(path, options.png, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) throw error;
    imageUrl = publicUrl("renders", path);
  }

  const { data, error } = await supabase
    .from("snapshots")
    .insert({
      id,
      project_id: options.projectId,
      title: options.title,
      image_url: imageUrl,
      state: JSON.parse(JSON.stringify(options.state)),
    })
    .select("id, share_token")
    .single();
  if (error) throw error;
  if (!data?.share_token) throw new Error("공유 토큰을 발급하지 못했습니다.");

  return { id: data.id, shareToken: data.share_token, shareUrl: shareUrlFor(data.share_token), imageUrl };
}
