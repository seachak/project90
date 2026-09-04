/**
 * 브라우저 온디바이스 배경 제거 (@imgly/background-removal).
 * 모델(~40MB)은 최초 1회 CDN 에서 내려받아 브라우저 캐시에 저장된다.
 */
export interface RemoveBgProgress {
  /** 0~1 */
  fraction: number;
  /** 'fetch:...' | 'compute:...' */
  stage: string;
}

export async function removeImageBackground(
  file: Blob,
  onProgress?: (progress: RemoveBgProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  if (signal?.aborted) throw new DOMException("취소되었습니다.", "AbortError");
  return removeBackground(file, {
    output: { format: "image/png", quality: 1 },
    progress: (key, current, total) => {
      onProgress?.({ fraction: total > 0 ? current / total : 0, stage: key });
    },
  });
}
