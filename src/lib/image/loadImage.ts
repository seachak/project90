/**
 * 브라우저 이미지 로딩/변환 유틸 (DOM 필요)
 */
import type { RasterLike } from "@/lib/image/palette";

export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = typeof src === "string" ? null : URL.createObjectURL(src);
    if (typeof src === "string" && !src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 불러오지 못했습니다."));
    };
    img.src = objectUrl ?? (src as string);
  });
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** 긴 변이 maxSize 를 넘지 않도록 축소한 캔버스 */
export function drawToCanvas(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  maxSize?: number,
): HTMLCanvasElement {
  const sw = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sh = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = maxSize ? Math.min(1, maxSize / Math.max(sw, sh)) : 1;
  const canvas = createCanvas(sw * scale, sh * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d")!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function rasterToCanvas(raster: RasterLike): HTMLCanvasElement {
  const canvas = createCanvas(raster.width, raster.height);
  const ctx = canvas.getContext("2d")!;
  const imageData =
    raster instanceof ImageData
      ? raster
      : new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("이미지 인코딩에 실패했습니다."))),
      type,
      quality,
    );
  });
}

export async function blobToImageData(blob: Blob, maxSize?: number): Promise<ImageData> {
  const img = await loadImage(blob);
  return canvasToImageData(drawToCanvas(img, maxSize));
}

export async function rasterToBlob(raster: RasterLike, type = "image/png", quality?: number): Promise<Blob> {
  return canvasToBlob(rasterToCanvas(raster), type, quality);
}

export function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return loadImage(blob).then((img) => ({ width: img.naturalWidth, height: img.naturalHeight }));
}
