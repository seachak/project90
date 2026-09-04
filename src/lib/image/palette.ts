/**
 * 대표색 추출 (k-means) 및 색 변환 유틸.
 * DOM 에 의존하지 않으므로 Node/vitest 에서도 동작한다.
 */
import type { HueBucket } from "@/types/material";

export type RGB = [number, number, number];

export interface RasterLike {
  width: number;
  height: number;
  /** RGBA, length = width * height * 4 */
  data: Uint8ClampedArray;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function rgbToHex([r, g, b]: RGB): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** HSL: h 0~360, s 0~1, l 0~1 */
export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

/** 시드 고정 PRNG (결과 재현성) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist2(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

export interface PaletteEntry {
  color: RGB;
  hex: string;
  /** 0~1 비중 */
  weight: number;
}

/**
 * k-means (k-means++ 초기화, 고정 시드) 로 픽셀 군집화.
 */
export function kmeansColors(pixels: RGB[], k = 5, iterations = 12): PaletteEntry[] {
  if (pixels.length === 0) return [];
  const kk = Math.min(k, pixels.length);
  const rand = mulberry32(1337);

  // k-means++ 초기화
  const centroids: RGB[] = [pixels[Math.floor(rand() * pixels.length)]];
  while (centroids.length < kk) {
    const d = pixels.map((p) => Math.min(...centroids.map((c) => dist2(p, c))));
    const total = d.reduce((s, v) => s + v, 0);
    if (total === 0) {
      centroids.push(pixels[Math.floor(rand() * pixels.length)]);
      continue;
    }
    let r = rand() * total;
    let idx = 0;
    for (; idx < d.length - 1; idx++) {
      r -= d[idx];
      if (r <= 0) break;
    }
    centroids.push(pixels[idx]);
  }

  const assign = new Int32Array(pixels.length);
  for (let it = 0; it < iterations; it++) {
    let changed = false;
    for (let i = 0; i < pixels.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dd = dist2(pixels[i], centroids[c]);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pixels.length; i++) {
      const s = sums[assign[i]];
      s[0] += pixels[i][0];
      s[1] += pixels[i][1];
      s[2] += pixels[i][2];
      s[3] += 1;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c][3] > 0) {
        centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
    if (!changed) break;
  }

  const counts = new Array(centroids.length).fill(0);
  for (let i = 0; i < pixels.length; i++) counts[assign[i]]++;
  return centroids
    .map((color, i) => ({
      color: [Math.round(color[0]), Math.round(color[1]), Math.round(color[2])] as RGB,
      hex: rgbToHex(color),
      weight: counts[i] / pixels.length,
    }))
    .filter((e) => e.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

export interface ExtractPaletteOptions {
  k?: number;
  /** 최대 샘플 픽셀 수 */
  maxSamples?: number;
  /** 이 값 미만 알파는 무시 (투명 배경 컷아웃) */
  alphaThreshold?: number;
}

/** 이미지에서 대표색 팔레트 추출 (비중 내림차순) */
export function extractPalette(img: RasterLike, options: ExtractPaletteOptions = {}): PaletteEntry[] {
  const { k = 5, maxSamples = 4000, alphaThreshold = 128 } = options;
  const total = img.width * img.height;
  const step = Math.max(1, Math.floor(total / maxSamples));
  const pixels: RGB[] = [];
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    if (img.data[o + 3] < alphaThreshold) continue;
    pixels.push([img.data[o], img.data[o + 1], img.data[o + 2]]);
  }
  return kmeansColors(pixels, k);
}

/** 가장 비중이 큰 색을 HEX 로 */
export function dominantColorHex(img: RasterLike, options?: ExtractPaletteOptions): string | null {
  const palette = extractPalette(img, options);
  return palette[0]?.hex ?? null;
}

/** 팔레트 필터용 색 계열 분류 */
export function hueBucketOf(hex: string): HueBucket | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb);

  if (l >= 0.88 && s <= 0.25) return "white";
  if (l <= 0.18) return "black";
  if (s <= 0.09) return l >= 0.85 ? "white" : "gray";

  // 저채도 웜톤 → 베이지/브라운
  if (h >= 15 && h <= 60 && s <= 0.55) {
    return l >= 0.55 ? "beige" : "brown";
  }
  if (h < 12 || h >= 345) return l >= 0.72 && s <= 0.6 ? "pink" : "red";
  if (h < 45) return l < 0.4 ? "brown" : "red";
  if (h < 70) return "yellow";
  if (h < 170) return "green";
  if (h < 260) return "blue";
  if (h < 305) return "purple";
  return "pink";
}
