/**
 * 타일 패턴 배치 엔진 (순수 함수, DOM 비의존)
 *
 * 정면 뷰(rectified, mm 단위) 좌표계에서 각 타일 셀의 위치를 계산한다.
 * 셀은 "타일 + 줄눈" 피치 단위이며, 실제 타일은 셀 안쪽으로 줄눈/2 만큼 들어가 그려진다.
 */
import type { TilePattern } from "@/types/material";

export interface TileLayoutOptions {
  pattern: TilePattern;
  /** 타일 가로 (mm) */
  tileW: number;
  /** 타일 세로 (mm) */
  tileH: number;
  /** 줄눈 폭 (mm) */
  grout: number;
  /** 덮어야 할 영역 (mm, 패턴 좌표계 기준) */
  area: { minX: number; minY: number; maxX: number; maxY: number };
  /** 패턴 오프셋 (mm) */
  offsetX?: number;
  offsetY?: number;
  /** 패턴 전체 회전 (deg, 원점 기준). diagonal 은 자동으로 45 */
  rotateDeg?: number;
}

export interface TileCell {
  /** 셀 좌상단 (mm, 패턴 로컬 좌표 — 회전/오프셋 적용 전) */
  x: number;
  y: number;
  /** 셀 크기 (mm, 줄눈 포함 피치) */
  w: number;
  h: number;
  /** 셀 내 타일 회전 (deg): 0 또는 90 (세로로 놓인 타일) */
  rot: 0 | 90;
  row: number;
  col: number;
}

export interface TileLayout {
  cells: TileCell[];
  /** 최종 패턴 회전 (deg) */
  rotateDeg: number;
  offsetX: number;
  offsetY: number;
}

/** 시드 고정 해시 (row, col) → 0~1 : 밝기 변화·랜덤 회전용 */
export function cellHash(row: number, col: number, salt = 0): number {
  let h = (Math.imul(row + 7919, 73856093) ^ Math.imul(col + 104729, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function rotateBounds(area: TileLayoutOptions["area"], deg: number, ox: number, oy: number) {
  // 패턴 로컬 좌표 = R(-deg) · (world - offset)
  const rad = (-deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const corners = [
    [area.minX, area.minY],
    [area.maxX, area.minY],
    [area.maxX, area.maxY],
    [area.minX, area.maxY],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    const lx = (x - ox) * c - (y - oy) * s;
    const ly = (x - ox) * s + (y - oy) * c;
    minX = Math.min(minX, lx);
    minY = Math.min(minY, ly);
    maxX = Math.max(maxX, lx);
    maxY = Math.max(maxY, ly);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 패턴별 셀 배치. 셀 좌표는 패턴 로컬 좌표(회전·오프셋 전).
 */
export function layoutTiles(options: TileLayoutOptions): TileLayout {
  const { pattern, grout } = options;
  const tileW = Math.max(1, options.tileW);
  const tileH = Math.max(1, options.tileH);
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  const rotateDeg = (options.rotateDeg ?? 0) + (pattern === "diagonal" ? 45 : 0);
  const local = rotateBounds(options.area, rotateDeg, offsetX, offsetY);
  const cells: TileCell[] = [];

  const pw = tileW + grout; // 가로 피치
  const ph = tileH + grout; // 세로 피치

  if (pattern === "herringbone") {
    // 긴 변 L, 짧은 변 S. n = L/S (정수로 반올림, 최소 2)
    const L = Math.max(tileW, tileH);
    const S = Math.min(tileW, tileH);
    const n = Math.max(2, Math.round(L / S));
    const sp = S + grout; // 짧은 피치
    const lp = n * sp; // 긴 피치 (줄눈 정렬을 위해 n·sp 로 맞춤)
    // 격자 벡터: v1 = (-sp, sp) 계단, v2 = (lp, lp) 반복. 단위 L-형(가로 타일 + 세로 타일).
    // 셀 영역: 로컬 bbox 를 충분히 덮도록 a, b 범위를 계산
    const span = Math.max(local.maxX - local.minX, local.maxY - local.minY) + lp * 2 + sp * 2;
    const aMin = Math.floor((local.minX + local.minY) / (2 * lp)) - 2;
    const aMax = Math.ceil((local.maxX + local.maxY) / (2 * lp)) + 2;
    const bRange = Math.ceil(span / sp) + 2;
    for (let a = aMin; a <= aMax; a++) {
      for (let b = -bRange; b <= bRange; b++) {
        const ox = a * lp - b * sp;
        const oy = a * lp + b * sp;
        // 가로 타일 (L×S)
        pushIfVisible(cells, { x: ox, y: oy, w: lp, h: sp, rot: 0, row: b, col: a }, local);
        // 세로 타일 (S×L) — 가로 타일 오른쪽에 붙음
        pushIfVisible(cells, { x: ox + lp, y: oy, w: sp, h: lp, rot: 90, row: b, col: a + 100000 }, local);
      }
    }
    return { cells, rotateDeg, offsetX, offsetY };
  }

  if (pattern === "stack") {
    // 세로 쌓기: 타일을 90도 세워서 정렬 격자
    const cw = ph;
    const ch = pw;
    const c0 = Math.floor(local.minX / cw) - 1;
    const c1 = Math.ceil(local.maxX / cw) + 1;
    const r0 = Math.floor(local.minY / ch) - 1;
    const r1 = Math.ceil(local.maxY / ch) + 1;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        cells.push({ x: c * cw, y: r * ch, w: cw, h: ch, rot: 90, row: r, col: c });
      }
    }
    return { cells, rotateDeg, offsetX, offsetY };
  }

  // grid / brick / brick_1_3 / diagonal(=grid 회전)
  const shiftFraction = pattern === "brick" ? 0.5 : pattern === "brick_1_3" ? 1 / 3 : 0;
  const r0 = Math.floor(local.minY / ph) - 1;
  const r1 = Math.ceil(local.maxY / ph) + 1;
  for (let r = r0; r <= r1; r++) {
    const shift = shiftFraction === 0 ? 0 : (((r * shiftFraction) % 1) + 1) % 1; // 0~1
    const rowOffset = shift * pw;
    const c0 = Math.floor((local.minX - rowOffset) / pw) - 1;
    const c1 = Math.ceil((local.maxX - rowOffset) / pw) + 1;
    for (let c = c0; c <= c1; c++) {
      cells.push({ x: c * pw + rowOffset, y: r * ph, w: pw, h: ph, rot: 0, row: r, col: c });
    }
  }
  return { cells, rotateDeg, offsetX, offsetY };
}

function pushIfVisible(cells: TileCell[], cell: TileCell, local: TileLayoutOptions["area"]) {
  if (cell.x + cell.w < local.minX || cell.x > local.maxX || cell.y + cell.h < local.minY || cell.y > local.maxY) return;
  cells.push(cell);
}

/**
 * 타일 매수 계산 (견적용): 면적 ÷ (타일+줄눈) 면적, 로스율 반영해 올림
 */
export function estimateTileCount(areaWmm: number, areaHmm: number, tileW: number, tileH: number, grout: number, lossRate = 0.07): {
  exact: number;
  withLoss: number;
  areaM2: number;
} {
  const areaM2 = (areaWmm * areaHmm) / 1_000_000;
  const cellArea = (tileW + grout) * (tileH + grout);
  const exact = cellArea > 0 ? (areaWmm * areaHmm) / cellArea : 0;
  return { exact, withLoss: Math.ceil(exact * (1 + lossRate)), areaM2 };
}
