/**
 * 호모그래피(3×3 사영 변환) 유틸.
 * 행렬은 row-major number[9]: [h0 h1 h2; h3 h4 h5; h6 h7 h8]
 *
 *   [x']   [h0 h1 h2] [x]
 *   [y'] = [h3 h4 h5] [y]
 *   [w ]   [h6 h7 h8] [1]     →  (x'/w, y'/w)
 */
import type { Point } from "@/lib/geometry";

export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** 가우스 소거법으로 n×n 선형계 Ax=b 풀기 (부분 피벗) */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error("호모그래피를 계산할 수 없습니다 (점이 한 직선 위에 있거나 중복).");
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * 4점 대응 src[i] → dst[i] 로 호모그래피 계산 (h8 = 1 정규화, 8×8 선형계).
 */
export function computeHomography(src: readonly Point[], dst: readonly Point[]): Mat3 {
  if (src.length !== 4 || dst.length !== 4) throw new Error("4점이 필요합니다.");
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** 단위 정사각형 (0,0),(1,0),(1,1),(0,1) → quad(좌상,우상,우하,좌하) */
export function homographyFromUnitSquare(quad: readonly Point[]): Mat3 {
  return computeHomography(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    quad,
  );
}

/** 실제 치수(mm) 직사각형 (0,0)-(w,h) → quad */
export function homographyFromRect(widthMm: number, heightMm: number, quad: readonly Point[]): Mat3 {
  return computeHomography(
    [
      [0, 0],
      [widthMm, 0],
      [widthMm, heightMm],
      [0, heightMm],
    ],
    quad,
  );
}

export function applyHomography(H: Mat3, p: Point): Point {
  const [x, y] = p;
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function invertHomography(H: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error("역행렬이 존재하지 않습니다.");
  const inv: Mat3 = [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
  return inv;
}

export function multiplyHomography(A: Mat3, B: Mat3): Mat3 {
  const out = new Array(9).fill(0) as Mat3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    }
  }
  return out;
}

/** h8 이 1 이 되도록 정규화 */
export function normalizeHomography(H: Mat3): Mat3 {
  const s = H[8] !== 0 ? 1 / H[8] : 1;
  return H.map((v) => v * s) as Mat3;
}

/**
 * 점 p(입력 좌표계)에서의 국소 스케일 — 야코비안의 특이값 근사.
 * 반환값: 입력 단위당 출력 픽셀 수 (x 방향, y 방향, 기하평균)
 */
export function localScale(H: Mat3, p: Point, eps = 1e-3): { sx: number; sy: number; mean: number } {
  const o = applyHomography(H, p);
  const px = applyHomography(H, [p[0] + eps, p[1]]);
  const py = applyHomography(H, [p[0], p[1] + eps]);
  const sx = Math.hypot(px[0] - o[0], px[1] - o[1]) / eps;
  const sy = Math.hypot(py[0] - o[0], py[1] - o[1]) / eps;
  return { sx, sy, mean: Math.sqrt(sx * sy) };
}

/** WebGL 용 column-major Float32Array (mat3) */
export function toGlMat3(H: Mat3): Float32Array {
  return new Float32Array([H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]]);
}
