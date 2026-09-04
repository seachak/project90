/**
 * 이진 마스크 → 외곽 폴리곤 (DOM 비의존)
 *
 * 각 선택 픽셀의 노출된 변을 방향 있는 간선으로 모아 루프로 연결하고,
 * 가장 큰 루프를 골라 RDP 로 단순화한다.
 */
import { polygonArea, simplifyPolygon, type Point } from "@/lib/geometry";

/** 마스크의 모든 경계 루프 (픽셀 모서리 좌표) */
export function traceContours(mask: Uint8Array, width: number, height: number): Point[][] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x]);
  const key = (x: number, y: number) => y * (width + 1) + x;

  // start → [ends]
  const edges = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    const list = edges.get(k);
    const e = key(x1, y1);
    if (list) list.push(e);
    else edges.set(k, [e]);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y); // 위: →
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1); // 오른쪽: ↓
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1); // 아래: ←
      if (!at(x - 1, y)) add(x, y + 1, x, y); // 왼쪽: ↑
    }
  }

  const loops: Point[][] = [];
  const unkey = (k: number): Point => [k % (width + 1), Math.floor(k / (width + 1))];
  for (const [startKey] of edges) {
    let list = edges.get(startKey);
    if (!list || list.length === 0) continue;
    const loop: Point[] = [unkey(startKey)];
    let current = startKey;
    let guard = 0;
    while (guard++ < width * height * 4) {
      list = edges.get(current);
      if (!list || list.length === 0) break;
      const next = list.pop()!;
      if (next === startKey) break;
      loop.push(unkey(next));
      current = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** 축 정렬된 계단형 점들 중 직선 위 중간점 제거 */
function collapseCollinear(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const dx1 = cur[0] - prev[0];
    const dy1 = cur[1] - prev[1];
    const dx2 = next[0] - cur[0];
    const dy2 = next[1] - cur[1];
    if (dx1 * dy2 - dy1 * dx2 !== 0) out.push(cur);
  }
  return out.length >= 3 ? out : points;
}

export interface MaskToPolygonOptions {
  /** RDP 허용 오차 (마스크 픽셀 단위) */
  epsilon?: number;
  /** 결과 좌표에 곱할 배율 (다운스케일 마스크 → 원본 픽셀) */
  scale?: number;
}

/**
 * 마스크의 가장 큰 외곽 루프를 폴리곤으로 반환한다 (없으면 null).
 */
export function maskToPolygon(
  mask: Uint8Array,
  width: number,
  height: number,
  options: MaskToPolygonOptions = {},
): Point[] | null {
  const { epsilon = 1.5, scale = 1 } = options;
  const loops = traceContours(mask, width, height);
  if (loops.length === 0) return null;
  let best = loops[0];
  let bestArea = polygonArea(best);
  for (const loop of loops) {
    const a = polygonArea(loop);
    if (a > bestArea) {
      best = loop;
      bestArea = a;
    }
  }
  const collapsed = collapseCollinear(best);
  const simplified = simplifyPolygon(collapsed, epsilon);
  return simplified.map(([x, y]) => [x * scale, y * scale]);
}
