/**
 * 표면 폴리곤 → 알파 마스크 캔버스 (가장자리 페더링 포함)
 * 마스크는 이미지 좌표계 전체를 담되 해상도는 maxSize 로 제한한다.
 */
import type { Point } from "@/lib/geometry";

export const MAX_MASK_SIZE = 2048;

export interface MaskCanvasResult {
  canvas: HTMLCanvasElement;
  /** 이미지 px → 마스크 px 배율 */
  scale: number;
}

export function drawPolygonMask(
  polygon: readonly Point[],
  imageWidth: number,
  imageHeight: number,
  options: { featherPx?: number; maxSize?: number; canvas?: HTMLCanvasElement } = {},
): MaskCanvasResult {
  const maxSize = options.maxSize ?? MAX_MASK_SIZE;
  const scale = Math.min(1, maxSize / Math.max(imageWidth, imageHeight));
  const w = Math.max(1, Math.round(imageWidth * scale));
  const h = Math.max(1, Math.round(imageHeight * scale));
  const canvas = options.canvas ?? document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  if (polygon.length < 3) return { canvas, scale };

  const feather = (options.featherPx ?? 2) * scale;
  ctx.save();
  if (feather > 0) ctx.filter = `blur(${feather.toFixed(2)}px)`;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(polygon[0][0] * scale, polygon[0][1] * scale);
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0] * scale, polygon[i][1] * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return { canvas, scale };
}
