/**
 * 2D 기하 유틸 (DOM 비의존)
 */
export type Point = [number, number];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function polygonBounds(points: readonly Point[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** 부호 있는 면적 (shoelace). 화면 좌표계(y 아래)에서는 시계방향이 양수 */
export function polygonSignedArea(points: readonly Point[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

export function polygonArea(points: readonly Point[]): number {
  return Math.abs(polygonSignedArea(points));
}

export function polygonCentroid(points: readonly Point[]): Point {
  const n = points.length;
  if (n === 0) return [0, 0];
  const a = polygonSignedArea(points);
  if (Math.abs(a) < 1e-9) {
    const b = polygonBounds(points);
    return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** ray casting */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  const [x, y] = p;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Ramer–Douglas–Peucker 단순화 (열린 폴리라인) */
export function simplifyPolyline(points: readonly Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points];
  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPolyline(points.slice(0, index + 1), epsilon);
    const right = simplifyPolyline(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/** 닫힌 폴리곤 단순화 — 가장 먼 두 점을 기준으로 두 개의 폴리라인으로 나눠 처리 */
export function simplifyPolygon(points: readonly Point[], epsilon: number): Point[] {
  if (points.length <= 4) return [...points];
  // 첫 점에서 가장 먼 점을 찾아 분할
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < points.length; i++) {
    const d = distance(points[0], points[i]);
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const a = simplifyPolyline(points.slice(0, far + 1), epsilon);
  const b = simplifyPolyline([...points.slice(far), points[0]], epsilon);
  const result = [...a.slice(0, -1), ...b.slice(0, -1)];
  return result.length >= 3 ? result : [...points];
}

/** 3차 베지어 평탄화 */
export function flattenCubicBezier(p0: Point, c1: Point, c2: Point, p3: Point, segments?: number): Point[] {
  const approxLen = distance(p0, c1) + distance(c1, c2) + distance(c2, p3);
  const n = segments ?? Math.max(4, Math.min(64, Math.ceil(approxLen / 6)));
  const out: Point[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
      a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
    ]);
  }
  return out;
}

export interface PathVertex {
  x: number;
  y: number;
  /** 이 꼭짓점에서 다음 꼭짓점으로 나가는 핸들 (절대 좌표) */
  out?: Point;
  /** 이전 꼭짓점에서 이 꼭짓점으로 들어오는 핸들 (절대 좌표) */
  in?: Point;
}

/**
 * 베지어 핸들이 섞인 닫힌 경로를 폴리곤 점 배열로 평탄화.
 * 핸들이 없는 구간은 직선.
 */
export function flattenPath(vertices: readonly PathVertex[], closed = true): Point[] {
  const n = vertices.length;
  if (n === 0) return [];
  const out: Point[] = [[vertices[0].x, vertices[0].y]];
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const p0: Point = [a.x, a.y];
    const p3: Point = [b.x, b.y];
    if (a.out || b.in) {
      const c1 = a.out ?? p0;
      const c2 = b.in ?? p3;
      out.push(...flattenCubicBezier(p0, c1, c2, p3));
    } else {
      out.push(p3);
    }
  }
  if (closed) out.pop(); // 마지막 점은 첫 점과 같음
  return out;
}

/** 시계방향(화면 좌표) 으로 정렬 */
export function ensureClockwise(points: readonly Point[]): Point[] {
  return polygonSignedArea(points) < 0 ? [...points].reverse() : [...points];
}

/**
 * 4점을 좌상·우상·우하·좌하 순으로 정렬한다 (사용자가 아무 순서로 찍어도 됨).
 */
export function orderQuad(points: readonly Point[]): Point[] {
  if (points.length !== 4) return [...points];
  const cx = points.reduce((s, p) => s + p[0], 0) / 4;
  const cy = points.reduce((s, p) => s + p[1], 0) / 4;
  const withAngle = points.map((p) => ({ p, a: Math.atan2(p[1] - cy, p[0] - cx) }));
  // 각도 오름차순: 화면 좌표계(y 아래)에서 -π..π → 좌상(-135°) 부근부터 시계방향
  withAngle.sort((u, v) => u.a - v.a);
  // 시작점을 좌상(각도가 -π/2 ~ -π 사이 즉 좌상 사분면)으로 회전
  let start = 0;
  let best = Infinity;
  withAngle.forEach((w, i) => {
    const d = Math.abs(w.a - (-Math.PI * 0.75));
    if (d < best) {
      best = d;
      start = i;
    }
  });
  const ordered = [...withAngle.slice(start), ...withAngle.slice(0, start)].map((w) => w.p);
  return ordered;
}
