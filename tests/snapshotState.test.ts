import { describe, expect, it } from "vitest";
import { buildSnapshotState, parseSnapshotState, SNAPSHOT_VERSION } from "@/lib/projects/snapshotState";
import { DEFAULT_SCENE } from "@/lib/render/colorGrade";
import type { RenderSurface } from "@/store/useProjectStore";
import type { Material } from "@/types/material";
import type { ObjectPlacement, TilePlacement } from "@/types/placement";

const material = (over: Partial<Material>): Material => ({
  id: "m1",
  kind: "tile_floor",
  name: "화이트 600각",
  brand: "샘플",
  model_code: null,
  texture_url: "/t.webp",
  thumbnail_url: "/t.webp",
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
  base_color: "#eee",
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

const surface: RenderSurface = {
  id: "s1",
  label: "바닥",
  surface_type: "floor",
  polygon: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  quad: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  real_width_mm: 3000,
  real_height_mm: 3000,
  shading_url: null,
  z_order: 0,
};

const tilePlacement: TilePlacement = {
  id: "p1",
  surface_id: "s1",
  material_id: "m1",
  pattern: "brick",
  offset_x_mm: 10,
  offset_y_mm: 20,
  rotate_deg: 5,
  grout_override: "#cccccc",
  z_order: 0,
};

const objectPlacement: ObjectPlacement = {
  id: "o1",
  material_id: "m2",
  pos_x: 0.5,
  pos_y: 0.8,
  scale: 1.1,
  rotation: 12,
  flip_x: true,
  z_order: 3,
};

function build() {
  return buildSnapshotState({
    scene: { ...DEFAULT_SCENE, temperature: 40, brightness: 1.1 },
    surfaces: [surface],
    materials: {
      m1: material({}),
      m2: material({ id: "m2", kind: "toilet", name: "양변기", cutout_url: "/c.png", real_width_mm: 380, price: 320000 }),
      m3: material({ id: "m3", name: "안 쓰인 자재" }),
    },
    tilePlacements: [tilePlacement],
    objectPlacements: [objectPlacement],
    estimate: null,
  });
}

describe("buildSnapshotState", () => {
  it("실제로 쓰인 자재만 담는다 (공유 화면은 익명이라 DB 를 다시 못 읽는다)", () => {
    const state = build();
    expect(state.materials.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  it("자재는 화면에 필요한 필드만 요약한다", () => {
    const m = build().materials.find((x) => x.id === "m2")!;
    expect(m).toEqual({
      id: "m2",
      name: "양변기",
      brand: "샘플",
      kind: "toilet",
      price: 320000,
      thumbnail_url: "/t.webp",
      tile_width_mm: 600,
      tile_height_mm: 600,
      real_width_mm: 380,
    });
  });

  it("표면은 라벨과 실치수만 남기고 폴리곤·마스크는 빼낸다", () => {
    const s = build().surfaces[0];
    expect(s).toEqual({ id: "s1", label: "바닥", surface_type: "floor", real_width_mm: 3000, real_height_mm: 3000 });
    expect("polygon" in s).toBe(false);
    expect("shading_url" in s).toBe(false);
  });

  it("호버 미리보기용 임시 배치는 저장하지 않는다", () => {
    const state = buildSnapshotState({
      scene: DEFAULT_SCENE,
      surfaces: [surface],
      materials: { m1: material({}) },
      tilePlacements: [tilePlacement, { ...tilePlacement, id: "__hover__" }],
      objectPlacements: [],
      estimate: null,
    });
    expect(state.tilePlacements).toHaveLength(1);
    expect(state.tilePlacements[0].id).toBe("p1");
  });

  it("버전을 기록한다", () => {
    expect(build().version).toBe(SNAPSHOT_VERSION);
  });
});

describe("parseSnapshotState", () => {
  it("build → JSON 왕복이 값을 보존한다", () => {
    const state = build();
    const parsed = parseSnapshotState(JSON.parse(JSON.stringify(state)));
    expect(parsed.tilePlacements).toEqual(state.tilePlacements);
    expect(parsed.objectPlacements).toEqual(state.objectPlacements);
    expect(parsed.materials).toEqual(state.materials);
    expect(parsed.surfaces).toEqual(state.surfaces);
    expect(parsed.scene).toEqual(state.scene);
  });

  it("깨진 입력에도 기본값으로 버틴다", () => {
    for (const bad of [null, undefined, 42, "x", [], {}]) {
      const parsed = parseSnapshotState(bad);
      expect(parsed.scene).toEqual(DEFAULT_SCENE);
      expect(parsed.surfaces).toEqual([]);
      expect(parsed.materials).toEqual([]);
      expect(parsed.tilePlacements).toEqual([]);
      expect(parsed.objectPlacements).toEqual([]);
    }
  });

  it("배치 배열 안의 잘못된 항목은 기본값으로 채운다", () => {
    const parsed = parseSnapshotState({
      objectPlacements: [{ id: "o9", material_id: "mX" }, "쓰레기", null],
      tilePlacements: [{ id: "t9", surface_id: "s9", material_id: "mY", pattern: 123 }],
    });
    expect(parsed.objectPlacements).toEqual([
      { id: "o9", material_id: "mX", pos_x: 0.5, pos_y: 0.5, scale: 1, rotation: 0, flip_x: false, z_order: 0 },
    ]);
    expect(parsed.tilePlacements[0].pattern).toBe("grid");
    expect(parsed.tilePlacements[0].grout_override).toBeNull();
  });

  it("DB 가 numeric 을 문자열로 돌려줘도 숫자로 읽는다", () => {
    const parsed = parseSnapshotState({
      objectPlacements: [{ id: "o1", material_id: "m", pos_x: "0.25", pos_y: "0.75", scale: "1.2" }],
    });
    expect(parsed.objectPlacements[0].pos_x).toBe(0.25);
    expect(parsed.objectPlacements[0].scale).toBe(1.2);
  });
});
