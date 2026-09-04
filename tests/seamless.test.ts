import { describe, expect, it } from "vitest";
import { measureSeam, mirrorTile, offsetBlend } from "@/lib/render/seamless";
import type { RasterLike } from "@/lib/image/palette";

function raster(width: number, height: number, fn: (x: number, y: number) => [number, number, number]): RasterLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("measureSeam", () => {
  it("단색 이미지는 이음매가 없다", () => {
    const img = raster(32, 32, () => [120, 120, 120]);
    const report = measureSeam(img);
    expect(report.horizontalSeam).toBe(0);
    expect(report.verticalSeam).toBe(0);
    expect(report.isSeamless).toBe(true);
  });

  it("가로 그라데이션은 좌우 이음매가 크다", () => {
    const img = raster(64, 16, (x) => [Math.round((x / 63) * 255), 0, 0]);
    const report = measureSeam(img);
    expect(report.horizontalSeam).toBeGreaterThan(80);
    expect(report.verticalSeam).toBe(0);
    expect(report.isSeamless).toBe(false);
  });

  it("세로 그라데이션은 상하 이음매가 크다", () => {
    const img = raster(16, 64, (_x, y) => [0, Math.round((y / 63) * 255), 0]);
    const report = measureSeam(img);
    expect(report.verticalSeam).toBeGreaterThan(80);
    expect(report.isSeamless).toBe(false);
  });
});

describe("mirrorTile", () => {
  it("크기가 2배가 되고 이음매가 사라진다", () => {
    const img = raster(32, 24, (x, y) => [x * 8, y * 10, 50]);
    const out = mirrorTile(img);
    expect(out.width).toBe(64);
    expect(out.height).toBe(48);
    const report = measureSeam(out);
    expect(report.horizontalSeam).toBe(0);
    expect(report.verticalSeam).toBe(0);
    expect(report.isSeamless).toBe(true);
  });

  it("좌상단 사분면은 원본과 같다", () => {
    const img = raster(4, 4, (x, y) => [x * 50, y * 50, 0]);
    const out = mirrorTile(img);
    const at = (r: RasterLike, x: number, y: number) => r.data[(y * r.width + x) * 4];
    expect(at(out, 3, 0)).toBe(at(img, 3, 0));
    // 거울: x=4 는 x=3 과 같아야 한다
    expect(at(out, 4, 0)).toBe(at(img, 3, 0));
    expect(at(out, 7, 0)).toBe(at(img, 0, 0));
  });
});

describe("offsetBlend", () => {
  it("그라데이션의 좌우 이음매를 제거한다", () => {
    const img = raster(64, 64, (x, y) => [Math.round((x / 63) * 255), Math.round((y / 63) * 255), 0]);
    const before = measureSeam(img);
    const out = offsetBlend(img);
    const after = measureSeam(out);
    expect(out.width).toBe(64);
    expect(after.horizontalSeam).toBeLessThan(before.horizontalSeam / 10);
    expect(after.verticalSeam).toBeLessThan(before.verticalSeam / 10);
    expect(after.isSeamless).toBe(true);
  });
});
