/**
 * 타일 텍스처 이음매(seam) 검사 및 보정.
 * ImageData 호환 객체({width,height,data})만 다루므로 DOM 없이 테스트 가능.
 */
import type { RasterLike } from "@/lib/image/palette";

export interface SeamReport {
  /** 좌↔우 가장자리 평균 절대차 (0~255) */
  horizontalSeam: number;
  /** 상↔하 가장자리 평균 절대차 (0~255) */
  verticalSeam: number;
  /** 이미지 내부 인접 픽셀 평균 절대차 (기준선) */
  baseline: number;
  /** seam / baseline 비율 (클수록 이음매가 눈에 띔) */
  score: number;
  isSeamless: boolean;
}

function absDiffRGB(data: Uint8ClampedArray, a: number, b: number): number {
  return (
    (Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2])) / 3
  );
}

/**
 * 좌우·상하 가장자리 픽셀 차이를 내부 인접 픽셀 차이와 비교해 이음매 여부를 판정한다.
 * seam <= max(2.5 * baseline, 6) 이면 "이음매 없음" 으로 본다.
 */
export function measureSeam(img: RasterLike, options: { ratioThreshold?: number; absoluteFloor?: number } = {}): SeamReport {
  const { ratioThreshold = 2.5, absoluteFloor = 6 } = options;
  const { width: w, height: h, data } = img;
  if (w < 2 || h < 2) {
    return { horizontalSeam: 0, verticalSeam: 0, baseline: 0, score: 0, isSeamless: true };
  }
  const idx = (x: number, y: number) => (y * w + x) * 4;

  let hs = 0;
  for (let y = 0; y < h; y++) hs += absDiffRGB(data, idx(w - 1, y), idx(0, y));
  hs /= h;

  let vs = 0;
  for (let x = 0; x < w; x++) vs += absDiffRGB(data, idx(x, h - 1), idx(x, 0));
  vs /= w;

  // 기준선: 내부 인접 픽셀 차이 (샘플링)
  let base = 0;
  let n = 0;
  const stepX = Math.max(1, Math.floor(w / 64));
  const stepY = Math.max(1, Math.floor(h / 64));
  for (let y = 0; y < h - 1; y += stepY) {
    for (let x = 0; x < w - 1; x += stepX) {
      base += absDiffRGB(data, idx(x, y), idx(x + 1, y));
      base += absDiffRGB(data, idx(x, y), idx(x, y + 1));
      n += 2;
    }
  }
  base = n > 0 ? base / n : 0;

  const seam = Math.max(hs, vs);
  const score = seam / Math.max(base, 1e-6);
  const isSeamless = seam <= Math.max(ratioThreshold * base, absoluteFloor);
  return { horizontalSeam: hs, verticalSeam: vs, baseline: base, score, isSeamless };
}

/** 2×2 거울 반복 — 항상 이음매 없는 텍스처가 된다 (크기 2배) */
export function mirrorTile(img: RasterLike): RasterLike {
  const { width: w, height: h, data } = img;
  const W = w * 2;
  const H = h * 2;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = y < h ? y : H - 1 - y;
    for (let x = 0; x < W; x++) {
      const sx = x < w ? x : W - 1 - x;
      const s = (sy * w + sx) * 4;
      const d = (y * W + x) * 4;
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
      out[d + 3] = data[s + 3];
    }
  }
  return { width: W, height: H, data: out };
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * 오프셋 블렌드 — 네 가지 소스를 바이리니어 가중치로 섞어 이음매를 숨긴다.
 *
 *   S  : 절반(hx,hy) 이동한 이미지  → 가장자리에서는 연속, 중앙 십자에 이음매
 *   Sh : x 만 이동한 이미지        → 가로 중앙선(y=hy) 근처에서 연속
 *   Sv : y 만 이동한 이미지        → 세로 중앙선(x=hx) 근처에서 연속
 *   O  : 원본                     → 중앙 교차점에서 연속
 *
 * 각 소스는 자기 이음매 위치에서 가중치가 0 이 되도록 배치되므로
 * 결과 이미지는 상하좌우 모두 이음매가 없다.
 */
export function offsetBlend(img: RasterLike, blendFraction = 0.2): RasterLike {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(w * h * 4);
  const hx = Math.floor(w / 2);
  const hy = Math.floor(h / 2);
  const bandX = Math.max(1, w * blendFraction);
  const bandY = Math.max(1, h * blendFraction);
  for (let y = 0; y < h; y++) {
    const sy = (y + hy) % h;
    const wy = 1 - smoothstep(0, bandY, Math.abs(y - hy));
    for (let x = 0; x < w; x++) {
      const sx = (x + hx) % w;
      const wx = 1 - smoothstep(0, bandX, Math.abs(x - hx));
      const aO = wx * wy;
      const aSh = wy * (1 - wx);
      const aSv = wx * (1 - wy);
      const aS = (1 - wx) * (1 - wy);
      const pS = (sy * w + sx) * 4;
      const pSh = (y * w + sx) * 4;
      const pSv = (sy * w + x) * 4;
      const pO = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        out[pO + c] = data[pS + c] * aS + data[pSh + c] * aSh + data[pSv + c] * aSv + data[pO + c] * aO;
      }
    }
  }
  return { width: w, height: h, data: out };
}

export type SeamFix = "none" | "mirror" | "offset";

export function applySeamFix(img: RasterLike, fix: SeamFix): RasterLike {
  switch (fix) {
    case "mirror":
      return mirrorTile(img);
    case "offset":
      return offsetBlend(img);
    default:
      return img;
  }
}
