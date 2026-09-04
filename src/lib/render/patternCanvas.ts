/**
 * 정면 뷰(rectified) 타일 패턴을 Canvas2D 로 그린다.
 * 결과 캔버스는 mm 바운딩 박스(patternRect)를 pxPerMm 배율로 담으며 WebGL 텍스처로 올라간다.
 */
import { cellHash, layoutTiles, type TileLayoutOptions } from "@/lib/render/tilePattern";
import type { TilePattern } from "@/types/material";

export interface PatternRect {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface DrawPatternOptions {
  image: CanvasImageSource | null;
  /** 텍스처 원본 크기 (drawImage 소스 영역용) */
  imageWidth: number;
  imageHeight: number;
  pattern: TilePattern;
  tileW: number;
  tileH: number;
  grout: number;
  groutColor: string;
  rect: PatternRect;
  pxPerMm: number;
  offsetX?: number;
  offsetY?: number;
  rotateDeg?: number;
  /** 타일별 밝기 변화 폭 (0.03 = ±3%) */
  jitter?: number;
  /** 정사각 타일 랜덤 90° 회전 */
  randomRotate?: boolean;
  /** 텍스처가 없을 때 채울 대표색 */
  fallbackColor?: string;
}

export const MAX_PATTERN_TEXTURE = 2048;

/** rect 를 최대 텍스처 크기 안에 담는 pxPerMm 계산 */
export function choosePxPerMm(rect: PatternRect, desiredPxPerMm: number, maxSize = MAX_PATTERN_TEXTURE): number {
  const limit = maxSize / Math.max(rect.width, rect.height, 1);
  return Math.max(0.05, Math.min(desiredPxPerMm, limit));
}

export function drawTilePattern(canvas: HTMLCanvasElement, options: DrawPatternOptions): void {
  const { rect, pxPerMm, grout, tileW, tileH } = options;
  const w = Math.max(1, Math.round(rect.width * pxPerMm));
  const h = Math.max(1, Math.round(rect.height * pxPerMm));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = options.groutColor;
  ctx.fillRect(0, 0, w, h);

  const layoutOptions: TileLayoutOptions = {
    pattern: options.pattern,
    tileW,
    tileH,
    grout,
    area: { minX: rect.minX, minY: rect.minY, maxX: rect.minX + rect.width, maxY: rect.minY + rect.height },
    offsetX: options.offsetX,
    offsetY: options.offsetY,
    rotateDeg: options.rotateDeg,
  };
  const layout = layoutTiles(layoutOptions);

  // mm → 캔버스 px, 그리고 패턴 로컬 좌표(회전·오프셋)
  ctx.scale(pxPerMm, pxPerMm);
  ctx.translate(-rect.minX, -rect.minY);
  ctx.translate(layout.offsetX, layout.offsetY);
  ctx.rotate((layout.rotateDeg * Math.PI) / 180);

  const jitter = options.jitter ?? 0.03;
  const square = Math.abs(tileW - tileH) < 1e-6;
  const img = options.image;
  const fallback = options.fallbackColor ?? "#bbbbbb";
  const gap = grout / 2;

  for (const cell of layout.cells) {
    const x = cell.x + gap;
    const y = cell.y + gap;
    const cw = cell.w - grout;
    const ch = cell.h - grout;
    if (cw <= 0 || ch <= 0) continue;
    const r = cellHash(cell.row, cell.col);
    ctx.save();
    ctx.translate(x + cw / 2, y + ch / 2);
    // 셀 회전(세로 타일)과 랜덤 회전을 합쳐서 그림
    let quarter = cell.rot === 90 ? 1 : 0;
    if (options.randomRotate) {
      quarter += square ? Math.floor(cellHash(cell.row, cell.col, 7) * 4) : Math.floor(cellHash(cell.row, cell.col, 7) * 2) * 2;
    }
    quarter %= 4;
    ctx.rotate((quarter * Math.PI) / 2);
    // 회전 후 그릴 영역: 홀수 quarter 면 가로세로가 바뀜
    const dw = quarter % 2 === 1 ? ch : cw;
    const dh = quarter % 2 === 1 ? cw : ch;
    if (img) {
      ctx.drawImage(img, 0, 0, options.imageWidth, options.imageHeight, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.fillStyle = fallback;
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    }
    if (jitter > 0) {
      const delta = (r - 0.5) * 2 * jitter;
      ctx.fillStyle = delta >= 0 ? `rgba(255,255,255,${delta})` : `rgba(0,0,0,${-delta})`;
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
  }
}
