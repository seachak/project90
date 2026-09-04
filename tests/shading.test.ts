import { describe, expect, it } from "vitest";
import { rasterizePolygon } from "@/lib/mask/rasterize";
import { computeShading, decodeShadingPixel, encodeShading, gaussianApprox, srgbToLabL } from "@/lib/render/shading";
import type { RasterLike } from "@/lib/image/palette";

function raster(width: number, height: number, fn: (x: number, y: number) => number): RasterLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.round(fn(x, y));
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

describe("rasterizePolygon", () => {
  it("사각형을 채운다", () => {
    const mask = rasterizePolygon(
      [
        [2, 2],
        [8, 2],
        [8, 6],
        [2, 6],
      ],
      10,
      10,
    );
    let count = 0;
    for (const v of mask) count += v;
    expect(count).toBe(6 * 4);
    expect(mask[3 * 10 + 3]).toBe(1);
    expect(mask[0]).toBe(0);
  });

  it("배율을 적용한다", () => {
    const mask = rasterizePolygon(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      10,
      10,
      0.1,
    );
    let count = 0;
    for (const v of mask) count += v;
    expect(count).toBe(100);
  });
});

describe("srgbToLabL / gaussianApprox", () => {
  it("흰색은 100, 검정은 0, 중간 회색은 약 53", () => {
    expect(srgbToLabL(255, 255, 255)).toBeCloseTo(100, 0);
    expect(srgbToLabL(0, 0, 0)).toBe(0);
    expect(srgbToLabL(128, 128, 128)).toBeCloseTo(53.6, 0);
  });

  it("블러는 균일한 값을 유지한다", () => {
    const src = new Float32Array(20 * 20).fill(42);
    const out = gaussianApprox(src, 20, 20, 3);
    expect(out[10 * 20 + 10]).toBeCloseTo(42, 3);
  });
});

describe("computeShading", () => {
  it("균일한 사진에서는 light ≈ 1, detail ≈ 0", () => {
    const img = raster(64, 64, () => 140);
    const mask = new Uint8Array(64 * 64).fill(1);
    const r = computeShading(img, mask);
    for (const i of [0, 1000, 2047, 4095]) {
      expect(r.light[i]).toBeCloseTo(1, 3);
      expect(Math.abs(r.detail[i])).toBeLessThan(1e-4);
    }
  });

  it("좌→우 밝기 그라데이션: 어두운 쪽 <1, 밝은 쪽 >1", () => {
    const img = raster(128, 32, (x) => 60 + (x / 127) * 160);
    const mask = new Uint8Array(128 * 32).fill(1);
    const r = computeShading(img, mask, { sigma: 4 });
    expect(r.light[16 * 128 + 8]).toBeLessThan(0.9);
    expect(r.light[16 * 128 + 120]).toBeGreaterThan(1.1);
    // 클램프 범위
    for (const v of r.light) {
      expect(v).toBeGreaterThanOrEqual(0.3);
      expect(v).toBeLessThanOrEqual(2);
    }
  });

  it("마스크 밖 픽셀은 영향을 주지 않는다 (정규화 컨볼루션)", () => {
    // 왼쪽 절반은 매우 어둡고(마스크 밖) 오른쪽 절반은 균일한 밝기(마스크 안)
    const img = raster(64, 32, (x) => (x < 32 ? 5 : 150));
    const mask = new Uint8Array(64 * 32);
    for (let y = 0; y < 32; y++) for (let x = 32; x < 64; x++) mask[y * 64 + x] = 1;
    const r = computeShading(img, mask, { sigma: 6 });
    // 경계 바로 안쪽도 1 에 가까워야 한다 (어두운 바깥이 새어 들어오면 <1)
    expect(r.light[16 * 64 + 33]).toBeCloseTo(1, 2);
    expect(r.light[16 * 64 + 60]).toBeCloseTo(1, 2);
    // 마스크 밖은 1 (무시)
    expect(r.light[16 * 64 + 5]).toBe(1);
  });

  it("작은 밝기 요철은 detail 로 남는다", () => {
    const img = raster(64, 64, (x, y) => 120 + ((x + y) % 2 === 0 ? 20 : -20));
    const mask = new Uint8Array(64 * 64).fill(1);
    const r = computeShading(img, mask, { sigma: 4, detailStrength: 0.35 });
    const a = r.detail[32 * 64 + 32];
    const b = r.detail[32 * 64 + 33];
    expect(Math.sign(a)).not.toBe(Math.sign(b));
    expect(Math.abs(a)).toBeGreaterThan(0.01);
  });

  it("encode/decode 왕복", () => {
    const img = raster(16, 16, (x) => 60 + x * 10);
    const mask = new Uint8Array(16 * 16).fill(1);
    const r = computeShading(img, mask, { sigma: 2 });
    const rgba = encodeShading(r, mask);
    const i = 8 * 16 + 8;
    const d = decodeShadingPixel(rgba, i);
    expect(d.light).toBeCloseTo(r.light[i], 1);
    expect(d.detail).toBeCloseTo(r.detail[i], 1);
    expect(rgba[i * 4 + 2]).toBe(255);
  });
});
