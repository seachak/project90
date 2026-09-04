import { describe, expect, it } from "vitest";
import {
  applyHomography,
  computeHomography,
  homographyFromRect,
  homographyFromUnitSquare,
  invertHomography,
  localScale,
  multiplyHomography,
  IDENTITY,
} from "@/lib/render/homography";
import type { Point } from "@/lib/geometry";

const close = (a: Point, b: Point, digits = 6) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};

describe("computeHomography", () => {
  it("같은 점끼리 대응하면 단위행렬", () => {
    const pts: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const H = computeHomography(pts, pts);
    H.forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i], 9));
  });

  it("4개 대응점을 정확히 매핑한다", () => {
    const src: Point[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const dst: Point[] = [
      [120, 80],
      [640, 60],
      [700, 500],
      [40, 420],
    ];
    const H = computeHomography(src, dst);
    src.forEach((p, i) => close(applyHomography(H, p), dst[i]));
  });

  it("아핀 변환(이동+스케일)을 복원한다", () => {
    const src: Point[] = [
      [0, 0],
      [2, 0],
      [2, 3],
      [0, 3],
    ];
    const dst: Point[] = src.map(([x, y]) => [x * 5 + 7, y * 2 - 1] as Point);
    const H = computeHomography(src, dst);
    close(applyHomography(H, [1, 1.5]), [12, 2]);
  });

  it("퇴화된 입력(한 직선 위)은 오류", () => {
    const line: Point[] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    expect(() => computeHomography(line, line)).toThrow();
  });
});

describe("invert / multiply", () => {
  const quad: Point[] = [
    [100, 90],
    [520, 70],
    [600, 480],
    [60, 440],
  ];
  const H = homographyFromUnitSquare(quad);

  it("역행렬은 원래 점으로 되돌린다", () => {
    const inv = invertHomography(H);
    const p: Point = [0.3, 0.7];
    close(applyHomography(inv, applyHomography(H, p)), p);
    close(applyHomography(inv, quad[2]), [1, 1]);
  });

  it("H · H⁻¹ ≈ I", () => {
    const M = multiplyHomography(H, invertHomography(H));
    const s = M[8];
    M.forEach((v, i) => expect(v / s).toBeCloseTo(IDENTITY[i], 6));
  });

  it("직선은 직선으로 유지된다 (중점 공선성)", () => {
    const a = applyHomography(H, [0, 0]);
    const b = applyHomography(H, [1, 0]);
    const m = applyHomography(H, [0.5, 0]);
    const cross = (b[0] - a[0]) * (m[1] - a[1]) - (b[1] - a[1]) * (m[0] - a[0]);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });
});

describe("homographyFromRect / localScale", () => {
  it("멀리 있는 곳(위쪽)일수록 픽셀/mm 가 작다", () => {
    // 바닥을 위에서 비스듬히 본 사다리꼴: 위쪽이 좁다
    const quad: Point[] = [
      [300, 200],
      [500, 200],
      [700, 600],
      [100, 600],
    ];
    const H = homographyFromRect(2000, 3000, quad);
    const near = localScale(H, [1000, 2900]);
    const far = localScale(H, [1000, 100]);
    expect(near.mean).toBeGreaterThan(far.mean);
    // 대략적인 값: 아래쪽 폭 600px / 2000mm = 0.3 px/mm
    expect(near.sx).toBeGreaterThan(0.2);
    expect(near.sx).toBeLessThan(0.4);
  });
});
