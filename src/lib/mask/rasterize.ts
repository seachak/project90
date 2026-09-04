/**
 * 폴리곤 → 비트 마스크 (스캔라인 even-odd 채우기, DOM 비의존)
 */
import type { Point } from "@/lib/geometry";

export function rasterizePolygon(polygon: readonly Point[], width: number, height: number, scale = 1): Uint8Array {
  const mask = new Uint8Array(width * height);
  const n = polygon.length;
  if (n < 3) return mask;
  const xs = polygon.map((p) => p[0] * scale);
  const ys = polygon.map((p) => p[1] * scale);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const y of ys) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  const crossings: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    crossings.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = ys[i];
      const yj = ys[j];
      if (yi > sy !== yj > sy) {
        const x = xs[i] + ((sy - yi) * (xs[j] - xs[i])) / (yj - yi);
        crossings.push(x);
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const xa = Math.max(0, Math.ceil(crossings[k] - 0.5));
      const xb = Math.min(width - 1, Math.floor(crossings[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) mask[y * width + x] = 1;
    }
  }
  return mask;
}
