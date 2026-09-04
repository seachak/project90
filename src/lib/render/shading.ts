/**
 * Shading map 추출 (순수 함수, DOM 비의존)
 *
 *  1) sRGB → Lab L* (0~100)
 *  2) 마스크 안에서만 정규화 컨볼루션(3회 박스 블러 ≈ 가우시안 σ) → 저주파 조명 Lb
 *  3) 마스크 안 Lb 평균 Lm
 *  4) light = Lb / Lm  (평균 1.0, 어두운 곳 0.6, 밝은 곳 1.4)
 *  5) detail = (L − Lb) / 100 × detailStrength  (미세 요철)
 *
 * 인코딩(RGBA 8bit): R = light / 2 (0.5 = 1.0), G = detail + 0.5 (0.5 = 0), B = 마스크, A = 255
 */
import type { RasterLike } from "@/lib/image/palette";

export interface ShadingOptions {
  /** 가우시안 σ (px). 기본 width/40 */
  sigma?: number;
  /** 디테일 성분 강도 (기본 0.35) */
  detailStrength?: number;
  /** light 클램프 */
  minLight?: number;
  maxLight?: number;
}

export interface ShadingResult {
  width: number;
  height: number;
  /** 조명 배율 (마스크 밖은 1) */
  light: Float32Array;
  /** 디테일 (마스크 밖은 0), 단위: 정규화 색값 */
  detail: Float32Array;
  /** 마스크 안 Lb 평균 (L*) */
  meanL: number;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB → CIE L* (0~100) */
export function srgbToLabL(r: number, g: number, b: number): number {
  const y = 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
  const f = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
  return Math.max(0, 116 * f - 16);
}

/** 이미지 → L* 채널 */
export function lumaL(img: RasterLike): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[i] = srgbToLabL(img.data[o], img.data[o + 1], img.data[o + 2]);
  }
  return out;
}

/** 1차원 박스 블러 (가로 또는 세로), 값 배열과 가중치 배열을 함께 누적 */
function boxBlurAxis(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number, horizontal: boolean): void {
  const len = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const stride = horizontal ? 1 : width;
  const lineStride = horizontal ? width : 1;
  const win = 2 * radius + 1;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStride;
    let sum = 0;
    // 초기 윈도우 [−radius, radius] (경계 밖은 0 → 정규화 컨볼루션이 보정)
    for (let i = -radius; i <= radius; i++) {
      if (i >= 0 && i < len) sum += src[base + i * stride];
    }
    for (let i = 0; i < len; i++) {
      dst[base + i * stride] = sum / win;
      const out = i - radius;
      const inn = i + radius + 1;
      if (out >= 0) sum -= src[base + out * stride];
      if (inn < len) sum += src[base + inn * stride];
    }
  }
}

/** 3회 박스 블러 ≈ 가우시안 */
export function gaussianApprox(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const radius = Math.max(1, Math.round(sigma * 0.9));
  const a = new Float32Array(src);
  const b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurAxis(a, b, width, height, radius, true);
    boxBlurAxis(b, a, width, height, radius, false);
  }
  return a;
}

/**
 * 마스크 영역의 shading map 계산.
 * @param img   다운스케일된 원본 (RGBA)
 * @param mask  같은 크기의 폴리곤 마스크 (1 = 표면)
 */
export function computeShading(img: RasterLike, mask: Uint8Array, options: ShadingOptions = {}): ShadingResult {
  const { width, height } = img;
  const n = width * height;
  const sigma = options.sigma ?? Math.max(2, width / 40);
  const detailStrength = options.detailStrength ?? 0.35;
  const minLight = options.minLight ?? 0.3;
  const maxLight = options.maxLight ?? 2.0;

  const L = lumaL(img);
  const masked = new Float32Array(n);
  const weight = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (mask[i]) {
      masked[i] = L[i];
      weight[i] = 1;
    }
  }
  // 정규화 컨볼루션: blur(L·m) / blur(m) → 마스크 밖 픽셀이 새어 들어오지 않는다
  const blurredL = gaussianApprox(masked, width, height, sigma);
  const blurredW = gaussianApprox(weight, width, height, sigma);

  const Lb = new Float32Array(n);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    Lb[i] = blurredW[i] > 1e-4 ? blurredL[i] / blurredW[i] : 0;
    if (mask[i]) {
      sum += Lb[i];
      count++;
    }
  }
  const meanL = count > 0 ? sum / count : 50;
  const light = new Float32Array(n).fill(1);
  const detail = new Float32Array(n);
  if (meanL > 1e-3) {
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      light[i] = Math.min(maxLight, Math.max(minLight, Lb[i] / meanL));
      detail[i] = ((L[i] - Lb[i]) / 100) * detailStrength;
    }
  }
  return { width, height, light, detail, meanL };
}

/** ShadingResult → RGBA 8bit (셰이더/PNG 인코딩용) */
export function encodeShading(result: ShadingResult, mask?: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const n = result.width * result.height;
  const out = new Uint8ClampedArray(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o] = Math.round(Math.min(1, Math.max(0, result.light[i] / 2)) * 255);
    out[o + 1] = Math.round(Math.min(1, Math.max(0, result.detail[i] + 0.5)) * 255);
    out[o + 2] = mask ? (mask[i] ? 255 : 0) : 255;
    out[o + 3] = 255;
  }
  return out;
}

/** 인코딩된 RGBA 에서 light/detail 을 다시 읽는다 (테스트/검증용) */
export function decodeShadingPixel(rgba: Uint8ClampedArray, index: number): { light: number; detail: number } {
  const o = index * 4;
  return { light: (rgba[o] / 255) * 2, detail: rgba[o + 1] / 255 - 0.5 };
}
