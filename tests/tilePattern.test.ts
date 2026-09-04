import { describe, expect, it } from "vitest";
import { cellHash, estimateTileCount, layoutTiles, type TileCell } from "@/lib/render/tilePattern";

const area = { minX: 0, minY: 0, maxX: 1200, maxY: 900 };

/** 영역 내부 샘플 점들이 정확히 한 셀에만 속하는지 (틈·겹침 없음) */
function coverage(cells: TileCell[], samples: [number, number][]): { gaps: number; overlaps: number } {
  let gaps = 0;
  let overlaps = 0;
  for (const [x, y] of samples) {
    let hits = 0;
    for (const c of cells) {
      if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) hits++;
    }
    if (hits === 0) gaps++;
    if (hits > 1) overlaps++;
  }
  return { gaps, overlaps };
}

function samples(step = 37): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 5; y < 900; y += step) for (let x = 5; x < 1200; x += step) out.push([x, y]);
  return out;
}

describe("layoutTiles", () => {
  it("grid: 600×600 타일이 1200×900 영역을 빈틈·겹침 없이 덮는다", () => {
    const { cells } = layoutTiles({ pattern: "grid", tileW: 600, tileH: 600, grout: 3, area });
    expect(coverage(cells, samples())).toEqual({ gaps: 0, overlaps: 0 });
    // 영역과 실제로 겹치는 셀 수: x 방향 2~3열, y 방향 2열 정도 + 여유 셀
    const overlapping = cells.filter((c) => c.x < 1200 && c.x + c.w > 0 && c.y < 900 && c.y + c.h > 0);
    expect(overlapping.length).toBeGreaterThanOrEqual(4);
    expect(overlapping.length).toBeLessThanOrEqual(9);
  });

  it("brick: 홀수 행은 피치의 50% 만큼 어긋난다", () => {
    const { cells } = layoutTiles({ pattern: "brick", tileW: 300, tileH: 100, grout: 2, area });
    const row0 = cells.filter((c) => c.row === 0).map((c) => c.x % 302).map((v) => ((v % 302) + 302) % 302);
    const row1 = cells.filter((c) => c.row === 1).map((c) => ((c.x % 302) + 302) % 302);
    expect(new Set(row0)).toEqual(new Set([0]));
    expect(new Set(row1)).toEqual(new Set([151]));
    expect(coverage(cells, samples(23))).toEqual({ gaps: 0, overlaps: 0 });
  });

  it("brick_1_3: 행마다 1/3 씩 누적 어긋남", () => {
    const { cells } = layoutTiles({ pattern: "brick_1_3", tileW: 300, tileH: 100, grout: 0, area });
    const shiftOf = (row: number) => {
      const c = cells.find((x) => x.row === row)!;
      return (((c.x % 300) + 300) % 300) / 300;
    };
    expect(shiftOf(0)).toBeCloseTo(0);
    expect(shiftOf(1)).toBeCloseTo(1 / 3);
    expect(shiftOf(2)).toBeCloseTo(2 / 3);
    expect(shiftOf(3)).toBeCloseTo(0);
  });

  it("stack: 타일을 세워서(90°) 격자 배치", () => {
    const { cells } = layoutTiles({ pattern: "stack", tileW: 300, tileH: 100, grout: 0, area });
    expect(cells.every((c) => c.rot === 90 && c.w === 100 && c.h === 300)).toBe(true);
    expect(coverage(cells, samples(29))).toEqual({ gaps: 0, overlaps: 0 });
  });

  it("herringbone: 가로·세로 타일이 번갈아 빈틈·겹침 없이 덮는다", () => {
    const { cells } = layoutTiles({ pattern: "herringbone", tileW: 200, tileH: 100, grout: 0, area });
    const horizontal = cells.filter((c) => c.rot === 0);
    const vertical = cells.filter((c) => c.rot === 90);
    expect(horizontal.length).toBeGreaterThan(0);
    expect(vertical.length).toBeGreaterThan(0);
    expect(horizontal.every((c) => c.w === 200 && c.h === 100)).toBe(true);
    expect(vertical.every((c) => c.w === 100 && c.h === 200)).toBe(true);
    expect(coverage(cells, samples(17))).toEqual({ gaps: 0, overlaps: 0 });
  });

  it("herringbone: 줄눈이 있어도 피치가 맞아 겹치지 않는다", () => {
    const { cells } = layoutTiles({ pattern: "herringbone", tileW: 600, tileH: 200, grout: 3, area });
    expect(coverage(cells, samples(31))).toEqual({ gaps: 0, overlaps: 0 });
  });

  it("diagonal 은 45° 회전을 더한다", () => {
    const layout = layoutTiles({ pattern: "diagonal", tileW: 300, tileH: 300, grout: 3, area, rotateDeg: 10 });
    expect(layout.rotateDeg).toBe(55);
    // 회전된 영역을 덮으려면 셀이 더 많이 필요
    const plain = layoutTiles({ pattern: "grid", tileW: 300, tileH: 300, grout: 3, area });
    expect(layout.cells.length).toBeGreaterThan(plain.cells.length);
  });

  it("오프셋은 결과 메타에 반영된다", () => {
    const layout = layoutTiles({ pattern: "grid", tileW: 300, tileH: 300, grout: 3, area, offsetX: 50, offsetY: -20 });
    expect(layout.offsetX).toBe(50);
    expect(layout.offsetY).toBe(-20);
  });
});

describe("cellHash", () => {
  it("결정적이고 0~1 범위", () => {
    expect(cellHash(3, 4)).toBe(cellHash(3, 4));
    expect(cellHash(3, 4)).not.toBe(cellHash(4, 3));
    for (let i = 0; i < 50; i++) {
      const v = cellHash(i, i * 2 + 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("estimateTileCount", () => {
  it("면적과 로스율을 반영해 매수를 올림한다", () => {
    const r = estimateTileCount(3000, 2400, 600, 600, 3, 0.07);
    expect(r.areaM2).toBeCloseTo(7.2);
    expect(r.exact).toBeCloseTo((3000 * 2400) / (603 * 603), 3);
    expect(r.withLoss).toBe(Math.ceil(r.exact * 1.07));
  });
});
