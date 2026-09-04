import { describe, expect, it } from "vitest";
import { buildEstimate, formatKRW, m2ToPyeong } from "@/lib/estimate";
import type { Material } from "@/types/material";
import type { TilePlacement } from "@/types/placement";

const tile = (over: Partial<Material>): Material => ({
  id: "m1",
  kind: "tile_floor",
  name: "600각",
  brand: null,
  model_code: null,
  texture_url: null,
  thumbnail_url: null,
  tile_width_mm: 600,
  tile_height_mm: 600,
  is_seamless: true,
  grout_color: "#ddd",
  grout_width_mm: 3,
  cutout_url: null,
  anchor_x: null,
  anchor_y: null,
  real_width_mm: null,
  real_height_mm: null,
  real_depth_mm: null,
  mount_type: null,
  finish: "matte",
  gloss: 0.05,
  base_color: null,
  price: 20000,
  currency: "KRW",
  tags: [],
  meta: {},
  owner_id: null,
  is_public: true,
  created_at: null,
  updated_at: null,
  ...over,
});

const placement = (surfaceId: string, materialId: string): TilePlacement => ({
  id: `p-${surfaceId}`,
  surface_id: surfaceId,
  material_id: materialId,
  pattern: "grid",
  offset_x_mm: 0,
  offset_y_mm: 0,
  rotate_deg: 0,
  grout_override: null,
  z_order: 0,
});

describe("buildEstimate", () => {
  const surfaces = [
    { id: "floor", label: "바닥", real_width_mm: 3000, real_height_mm: 2000 },
    { id: "wall", label: "정면벽", real_width_mm: 3000, real_height_mm: 2400 },
  ];

  it("표면별 매수·면적·금액을 합산한다", () => {
    const materials = { m1: tile({}), m2: tile({ id: "m2", kind: "tile_wall", tile_width_mm: 300, tile_height_mm: 600, price: 15000 }) };
    const est = buildEstimate(surfaces, [placement("floor", "m1"), placement("wall", "m2")], materials, 0.07);
    expect(est.lines).toHaveLength(2);
    const floor = est.lines[0];
    expect(floor.areaM2).toBeCloseTo(6);
    expect(floor.tileCountExact).toBeCloseTo((3000 * 2000) / (603 * 603), 3);
    expect(floor.tileCount).toBe(Math.ceil(floor.tileCountExact * 1.07));
    expect(floor.subtotal).toBe(floor.tileCount * 20000);
    expect(est.totalAreaM2).toBeCloseTo(6 + 7.2);
    expect(est.totalPrice).toBe(est.lines[0].subtotal! + est.lines[1].subtotal!);
    expect(est.hasUnknownPrice).toBe(false);
  });

  it("가격이 없는 자재는 합계에서 제외하고 표시만 한다", () => {
    const materials = { m1: tile({ price: null }) };
    const est = buildEstimate(surfaces, [placement("floor", "m1")], materials);
    expect(est.lines[0].subtotal).toBeNull();
    expect(est.totalPrice).toBe(0);
    expect(est.hasUnknownPrice).toBe(true);
  });

  it("로스율이 높을수록 매수가 늘어난다", () => {
    const materials = { m1: tile({}) };
    const low = buildEstimate(surfaces, [placement("floor", "m1")], materials, 0.05);
    const high = buildEstimate(surfaces, [placement("floor", "m1")], materials, 0.1);
    expect(high.lines[0].tileCount).toBeGreaterThanOrEqual(low.lines[0].tileCount);
  });

  it("배치가 없는 표면은 건너뛴다", () => {
    const est = buildEstimate(surfaces, [], { m1: tile({}) });
    expect(est.lines).toHaveLength(0);
    expect(est.totalAreaM2).toBe(0);
  });
});

describe("단위", () => {
  it("㎡ → 평", () => {
    expect(m2ToPyeong(3.305785)).toBeCloseTo(1);
    expect(m2ToPyeong(33.05785)).toBeCloseTo(10);
  });
  it("원화 포맷", () => {
    expect(formatKRW(1234567)).toMatch(/1,234,567/);
  });
});
