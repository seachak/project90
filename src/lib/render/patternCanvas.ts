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
  /** 타일별 밝기 변화 폭 (0.015 = ±1.5%). 실제 로트 편차 정도만 */
  jitter?: number;
  /** 정사각 타일 랜덤 90° 회전 */
  randomRotate?: boolean;
  /** 텍스처가 없을 때 채울 대표색 */
  fallbackColor?: string;
  /** 줄눈 깊이감 — 타일 가장자리 안쪽 그림자 세기 (0 = 끄기) */
  groutShade?: number;
}

/**
 * 표면 패턴 텍스처의 한 변 최대 픽셀.
 *
 * 표면 전체(예: 3000mm 벽)를 한 장에 담으므로 이 값이 곧 타일의 선명도다.
 * 2048 이면 3000mm 벽에서 0.68px/mm → 600각 타일이 410px 로 뭉개진다.
 * 4096 이면 그 두 배가 되어 실물 사진의 결이 살아난다.
 */
const PATTERN_TEXTURE_HIGH = 4096;
const PATTERN_TEXTURE_LOW = 2048;

/**
 * 기기 성능에 따른 상한.
 * 4096² 캔버스는 표면당 약 67MB 라 저사양·모바일에서는 낮춘다.
 * deviceMemory 를 모르는 브라우저(Safari 등)는 화면 크기로 대략 판단한다.
 */
export function maxPatternTexture(): number {
  if (typeof navigator === "undefined") return PATTERN_TEXTURE_HIGH;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === "number") return nav.deviceMemory >= 8 ? PATTERN_TEXTURE_HIGH : PATTERN_TEXTURE_LOW;
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return coarse ? PATTERN_TEXTURE_LOW : PATTERN_TEXTURE_HIGH;
}

export const MAX_PATTERN_TEXTURE = PATTERN_TEXTURE_HIGH;

/** rect 를 최대 텍스처 크기 안에 담는 pxPerMm 계산 */
export function choosePxPerMm(rect: PatternRect, desiredPxPerMm: number, maxSize = maxPatternTexture()): number {
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

  const jitter = options.jitter ?? 0.015;
  const groutShade = options.groutShade ?? 0.22;
  // ctx.filter 로 밝기를 바꾸면 색상·채도가 보존된다. 흰/검을 덮으면 색이 탁해진다.
  const canFilter = typeof ctx.filter === "string";
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
    // 타일별 미세한 밝기 편차 (같은 로트여도 장마다 조금씩 다르다)
    const delta = jitter > 0 ? (r - 0.5) * 2 * jitter : 0;
    if (img) {
      if (delta !== 0 && canFilter) ctx.filter = `brightness(${(1 + delta).toFixed(4)})`;
      ctx.drawImage(img, 0, 0, options.imageWidth, options.imageHeight, -dw / 2, -dh / 2, dw, dh);
      if (delta !== 0 && canFilter) ctx.filter = "none";
    } else {
      ctx.fillStyle = fallback;
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    }
    // ctx.filter 를 못 쓰는 브라우저는 예전처럼 덮되, 폭이 작아 색 변화가 눈에 띄지 않는다
    if (delta !== 0 && (!canFilter || !img)) {
      ctx.fillStyle = delta >= 0 ? `rgba(255,255,255,${delta})` : `rgba(0,0,0,${-delta})`;
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    }

    // 줄눈은 타일보다 파여 있어 가장자리에 그늘이 진다.
    // 이게 없으면 타일이 벽에 붙인 스티커처럼 평평해 보인다.
    if (groutShade > 0 && grout > 0) {
      const band = Math.min(Math.max(grout * 0.6, 0.4), Math.min(dw, dh) / 6);
      if (band > 0) {
        ctx.strokeStyle = `rgba(0,0,0,${groutShade})`;
        ctx.lineWidth = band;
        ctx.strokeRect(-dw / 2 + band / 2, -dh / 2 + band / 2, dw - band, dh - band);
        // 바깥쪽 절반은 더 옅게 — 그늘이 갑자기 끊기지 않도록
        ctx.strokeStyle = `rgba(0,0,0,${groutShade * 0.4})`;
        ctx.lineWidth = band;
        ctx.strokeRect(-dw / 2 + band * 1.5, -dh / 2 + band * 1.5, dw - band * 3, dh - band * 3);
      }
    }
    ctx.restore();
  }
}
