import "server-only";

import sharp from "sharp";

export interface ThumbnailResult {
  buffer: Buffer;
  width: number;
  height: number;
  /** 원본 크기 (EXIF 회전 반영) */
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * 긴 변 `size`px 의 WebP 썸네일 생성 (알파 채널 유지).
 */
export async function makeThumbnail(input: ArrayBuffer | Buffer, size = 400): Promise<ThumbnailResult> {
  const source = sharp(Buffer.isBuffer(input) ? input : Buffer.from(input)).rotate();
  const meta = await source.metadata();
  const { data, info } = await source
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const rotated = (meta.orientation ?? 1) >= 5;
  const sourceWidth = rotated ? (meta.height ?? 0) : (meta.width ?? 0);
  const sourceHeight = rotated ? (meta.width ?? 0) : (meta.height ?? 0);
  return { buffer: data, width: info.width, height: info.height, sourceWidth, sourceHeight };
}
