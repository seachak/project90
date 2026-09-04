import { describe, expect, it } from "vitest";
import { floodFill, smoothMask } from "@/lib/mask/floodFill";
import { maskToPolygon, traceContours } from "@/lib/mask/contour";
import {
  flattenPath,
  orderQuad,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  simplifyPolyline,
  type Point,
} from "@/lib/geometry";
import type { RasterLike } from "@/lib/image/palette";

function raster(width: number, height: number, fn: (x: number, y: number) => [number, number, number]): RasterLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y);
      const o = (y * width + x) * 4;
      data.set([r, g, b, 255], o);
    }
  }
  return { width, height, data };
}

describe("floodFill", () => {
  // 20×20, 중앙 10×10 사각형은 흰색, 나머지 검정
  const img = raster(20, 20, (x, y) => (x >= 5 && x < 15 && y >= 5 && y < 15 ? [250, 250, 250] : [10, 10, 10]));

  it("시드와 이어진 비슷한 색 영역만 선택한다", () => {
    const res = floodFill(img, 10, 10, { tolerance: 10 });
    expect(res.count).toBe(100);
    expect(res.bounds).toEqual({ minX: 5, minY: 5, maxX: 14, maxY: 14 });
    expect(res.mask[10 * 20 + 10]).toBe(1);
    expect(res.mask[0]).toBe(0);
  });

  it("허용오차 100 이면 전부 선택", () => {
    const res = floodFill(img, 0, 0, { tolerance: 100 });
    expect(res.count).toBe(400);
  });

  it("contiguous=false 면 떨어진 같은 색도 선택", () => {
    const two = raster(10, 1, (x) => (x === 0 || x === 9 ? [200, 0, 0] : [0, 0, 0]));
    expect(floodFill(two, 0, 0, { tolerance: 5 }).count).toBe(1);
    expect(floodFill(two, 0, 0, { tolerance: 5, contiguous: false }).count).toBe(2);
  });

  it("edgeThreshold 를 주면 색이 비슷해도 경계에서 멈춘다", () => {
    // 왼쪽 120, 오른쪽 140 — 허용오차 12(≈53) 로는 새어 나가지만 경계 감도로 막힌다
    const two = raster(40, 10, (x) => (x < 20 ? [120, 120, 120] : [140, 140, 140]));
    expect(floodFill(two, 5, 5, { tolerance: 12 }).count).toBe(400);
    const stopped = floodFill(two, 5, 5, { tolerance: 12, edgeThreshold: 10 });
    expect(stopped.count).toBeLessThan(220);
    expect(stopped.count).toBeGreaterThan(150);
    expect(stopped.mask[5 * 40 + 30]).toBe(0);
  });

  it("smoothMask 는 고립된 점을 지운다", () => {
    const mask = new Uint8Array(9 * 9);
    mask[4 * 9 + 4] = 1; // 단일 점
    const out = smoothMask(mask, 9, 9);
    expect(out[4 * 9 + 4]).toBe(0);
  });
});

describe("contour", () => {
  it("사각형 마스크의 외곽은 4점 폴리곤", () => {
    const w = 12;
    const h = 10;
    const mask = new Uint8Array(w * h);
    for (let y = 2; y < 8; y++) for (let x = 3; x < 9; x++) mask[y * w + x] = 1;
    const loops = traceContours(mask, w, h);
    expect(loops).toHaveLength(1);
    const poly = maskToPolygon(mask, w, h, { epsilon: 0.5 });
    expect(poly).not.toBeNull();
    expect(poly!).toHaveLength(4);
    expect(polygonArea(poly!)).toBe(36);
    expect(pointInPolygon([5, 5], poly!)).toBe(true);
    expect(pointInPolygon([1, 1], poly!)).toBe(false);
  });

  it("가장 큰 영역만 반환하고 배율을 적용한다", () => {
    const w = 20;
    const h = 20;
    const mask = new Uint8Array(w * h);
    for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) mask[y * w + x] = 1; // 10×10
    for (let y = 15; y < 18; y++) for (let x = 15; x < 18; x++) mask[y * w + x] = 1; // 3×3
    const poly = maskToPolygon(mask, w, h, { epsilon: 0.5, scale: 4 });
    expect(polygonArea(poly!)).toBe(100 * 16);
  });
});

describe("geometry", () => {
  it("simplifyPolyline 는 직선 위 점을 제거한다", () => {
    const pts: Point[] = [
      [0, 0],
      [1, 0.01],
      [2, 0],
      [3, 0.02],
      [4, 0],
    ];
    expect(simplifyPolyline(pts, 0.1)).toEqual([
      [0, 0],
      [4, 0],
    ]);
  });

  it("flattenPath 는 베지어 구간을 여러 점으로 펼친다", () => {
    const straight = flattenPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(straight).toHaveLength(3);
    const curved = flattenPath([
      { x: 0, y: 0, out: [0, 10] },
      { x: 10, y: 0, in: [10, 10] },
      { x: 10, y: -10 },
    ]);
    expect(curved.length).toBeGreaterThan(6);
    // 곡선의 중간점은 아래쪽(y>0)으로 볼록
    const mid = curved[Math.floor(curved.length / 3)];
    expect(mid[1]).toBeGreaterThan(0);
  });

  it("orderQuad 는 좌상·우상·우하·좌하 순으로 정렬한다", () => {
    const shuffled: Point[] = [
      [700, 600],
      [300, 200],
      [100, 600],
      [500, 200],
    ];
    expect(orderQuad(shuffled)).toEqual([
      [300, 200],
      [500, 200],
      [700, 600],
      [100, 600],
    ]);
  });

  it("polygonCentroid", () => {
    const c = polygonCentroid([
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ]);
    expect(c[0]).toBeCloseTo(2);
    expect(c[1]).toBeCloseTo(1);
  });
});
