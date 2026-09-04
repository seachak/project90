/**
 * 매직완드용 flood fill (순수 JS, DOM 비의존)
 */
import type { RasterLike } from "@/lib/image/palette";
import type { Bounds } from "@/lib/geometry";

export interface FloodFillOptions {
  /** 0~100. 시드 색과의 RGB 거리 허용치 (100 = 모두 선택) */
  tolerance: number;
  /** true 면 시드 픽셀과 이어진 영역만, false 면 색이 비슷한 픽셀 전부 */
  contiguous?: boolean;
  /**
   * 경계 감도 (0 = 끔). 3×3 블러 후 휘도 기울기가 이 값 이상인 픽셀은 벽처럼 작용해
   * 색이 비슷해도 옆 면(벽↔벽, 벽↔바닥)으로 새어 나가지 않게 한다.
   */
  edgeThreshold?: number;
}

/** 휘도 기울기 기반 경계 맵 (1 = 경계) */
export function computeEdgeBarrier(img: RasterLike, threshold: number): Uint8Array {
  const { width, height, data } = img;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    luma[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  // 3×3 박스 블러 (노이즈 억제)
  const blurred = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += luma[yy * width + xx];
          n++;
        }
      }
      blurred[y * width + x] = sum / n;
    }
  }
  const barrier = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = blurred[y * width + Math.max(0, x - 1)];
      const r = blurred[y * width + Math.min(width - 1, x + 1)];
      const u = blurred[Math.max(0, y - 1) * width + x];
      const d = blurred[Math.min(height - 1, y + 1) * width + x];
      const mag = Math.max(Math.abs(r - l), Math.abs(d - u));
      if (mag >= threshold) barrier[y * width + x] = 1;
    }
  }
  return barrier;
}

export interface FloodFillResult {
  /** width*height, 1 = 선택 */
  mask: Uint8Array;
  width: number;
  height: number;
  count: number;
  bounds: Bounds;
}

/**
 * 시드 (x,y) 에서 시작해 색이 비슷한 영역을 선택한다.
 * 거리: RGB 유클리드 (0~441) 를 0~100 으로 정규화해 tolerance 와 비교.
 */
export function floodFill(img: RasterLike, seedX: number, seedY: number, options: FloodFillOptions): FloodFillResult {
  const { width, height, data } = img;
  const contiguous = options.contiguous ?? true;
  const sx = Math.max(0, Math.min(width - 1, Math.round(seedX)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(seedY)));
  const seedIdx = (sy * width + sx) * 4;
  const r0 = data[seedIdx];
  const g0 = data[seedIdx + 1];
  const b0 = data[seedIdx + 2];
  const maxDist = (Math.max(0, Math.min(100, options.tolerance)) / 100) * 441.67;
  const maxDist2 = maxDist * maxDist;

  const mask = new Uint8Array(width * height);
  const barrier = options.edgeThreshold && options.edgeThreshold > 0 ? computeEdgeBarrier(img, options.edgeThreshold) : null;
  const similar = (i: number) => {
    if (barrier && barrier[i]) return false;
    const o = i * 4;
    const dr = data[o] - r0;
    const dg = data[o + 1] - g0;
    const db = data[o + 2] - b0;
    return dr * dr + dg * dg + db * db <= maxDist2;
  };

  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const mark = (i: number) => {
    mask[i] = 1;
    count++;
    const x = i % width;
    const y = (i - x) / width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  if (!contiguous) {
    for (let i = 0; i < width * height; i++) if (similar(i)) mark(i);
  } else {
    // 스캔라인 flood fill (스택 기반)
    const stack: number[] = [sy * width + sx];
    while (stack.length > 0) {
      const start = stack.pop()!;
      if (mask[start] || !similar(start)) continue;
      const y = Math.floor(start / width);
      let x1 = start % width;
      let x2 = x1;
      while (x1 > 0 && !mask[y * width + x1 - 1] && similar(y * width + x1 - 1)) x1--;
      while (x2 < width - 1 && !mask[y * width + x2 + 1] && similar(y * width + x2 + 1)) x2++;
      for (let x = x1; x <= x2; x++) {
        const i = y * width + x;
        mark(i);
      }
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= height) continue;
        let inRun = false;
        for (let x = x1; x <= x2; x++) {
          const i = ny * width + x;
          const ok = !mask[i] && similar(i);
          if (ok && !inRun) {
            stack.push(i);
            inRun = true;
          } else if (!ok) {
            inRun = false;
          }
        }
      }
    }
  }

  return { mask, width, height, count, bounds: { minX, minY, maxX, maxY } };
}

/** 3×3 다수결로 마스크의 잡음 제거 (작은 구멍/점 정리) */
export function smoothMask(mask: Uint8Array, width: number, height: number, passes = 1): Uint8Array {
  let src = mask;
  for (let p = 0; p < passes; p++) {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            sum += src[yy * width + xx];
          }
        }
        out[y * width + x] = sum >= 5 ? 1 : 0;
      }
    }
    src = out;
  }
  return src;
}
