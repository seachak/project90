import { describe, expect, it } from "vitest";
import { homographyFromRect, invertHomography } from "@/lib/render/homography";
import {
  DEFAULT_ANCHOR,
  imagePointToFixtureUv,
  mountHeightMm,
  mountTypeOf,
  pxPerMmAt,
  solveFixtureGeometry,
  type FixtureMaterialSpec,
  type FloorPlane,
} from "@/lib/render/fixture";
import type { Point } from "@/lib/geometry";

/**
 * 원근이 들어간 가상의 바닥면.
 * 3000×3000mm 바닥이 사다리꼴로 찍힌 사진 (위쪽이 멀고 좁다).
 * quad 순서는 좌상 → 우상 → 우하 → 좌하.
 */
const FLOOR_QUAD: Point[] = [
  [560, 700], // 먼 쪽 좌측
  [1040, 700], // 먼 쪽 우측
  [1500, 1150], // 가까운 쪽 우측
  [100, 1150], // 가까운 쪽 좌측
];
const IMAGE_WIDTH = 1600;

function makeFloor(): FloorPlane {
  const H = homographyFromRect(3000, 3000, FLOOR_QUAD);
  return { H, invH: invertHomography(H) };
}

const TOILET: FixtureMaterialSpec = {
  kind: "toilet",
  real_width_mm: 380,
  real_height_mm: 760,
  anchor_x: 0.5,
  anchor_y: 1,
  mount_type: "floor",
};

function geoAt(pos: Point, overrides: Partial<Parameters<typeof solveFixtureGeometry>[0]> = {}) {
  return solveFixtureGeometry({
    floor: makeFloor(),
    posImage: pos,
    material: TOILET,
    cutoutAspect: 0.5,
    userScale: 1,
    rotationDeg: 0,
    imageWidth: IMAGE_WIDTH,
    ...overrides,
  });
}

describe("pxPerMmAt", () => {
  it("가까운 바닥일수록 배율이 크다 (원근)", () => {
    const floor = makeFloor();
    const near = pxPerMmAt(floor, [800, 1120], IMAGE_WIDTH);
    const far = pxPerMmAt(floor, [800, 730], IMAGE_WIDTH);
    expect(near.mean).toBeGreaterThan(far.mean);
  });

  it("바닥면이 없으면 이미지 폭 기반 폴백을 쓴다", () => {
    const s = pxPerMmAt(null, [800, 900], IMAGE_WIDTH);
    expect(s.mean).toBeGreaterThan(0);
    expect(s.sx).toBe(s.sy);
  });

  it("퇴화된 좌표에서도 유한한 값을 돌려준다", () => {
    const s = pxPerMmAt(makeFloor(), [800, -100000], IMAGE_WIDTH);
    expect(Number.isFinite(s.mean)).toBe(true);
    expect(s.mean).toBeGreaterThan(0);
  });
});

describe("solveFixtureGeometry — 자동 스케일", () => {
  it("도기를 앞으로 끌면 커지고 뒤로 끌면 작아진다", () => {
    const widths = [730, 800, 900, 1000, 1120].map((y) => geoAt([800, y]).widthPx);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    }
  });

  it("실제 폭 × 접지점 배율 = 화면 폭", () => {
    const pos: Point = [800, 1000];
    const g = geoAt(pos);
    const s = pxPerMmAt(makeFloor(), pos, IMAGE_WIDTH);
    expect(g.widthPx).toBeCloseTo(380 * s.mean, 6);
  });

  it("컷아웃 비율이 세로 크기를 정한다", () => {
    const g = geoAt([800, 1000], { cutoutAspect: 0.5 });
    expect(g.heightPx).toBeCloseTo(g.widthPx / 0.5, 6);
  });

  it("앵커가 하단 중앙이면 스프라이트 밑변 중앙이 접지점과 일치한다", () => {
    const pos: Point = [800, 1000];
    const g = geoAt(pos);
    expect(g.centerPx[0]).toBeCloseTo(pos[0], 6);
    expect(g.centerPx[1] + g.heightPx / 2).toBeCloseTo(pos[1], 6);
  });

  it("앵커가 좌측이면 스프라이트가 오른쪽으로 밀린다", () => {
    const pos: Point = [800, 1000];
    const centered = geoAt(pos);
    const leftAnchor = geoAt(pos, { material: { ...TOILET, anchor_x: 0 } });
    expect(leftAnchor.centerPx[0]).toBeGreaterThan(centered.centerPx[0]);
    expect(leftAnchor.centerPx[0] - centered.centerPx[0]).toBeCloseTo(centered.widthPx / 2, 6);
  });

  it("앵커가 null 이면 기본값(하단 중앙)으로 처리한다", () => {
    const pos: Point = [800, 1000];
    const a = geoAt(pos, { material: { ...TOILET, anchor_x: null, anchor_y: null } });
    const b = geoAt(pos, { material: { ...TOILET, anchor_x: DEFAULT_ANCHOR[0], anchor_y: DEFAULT_ANCHOR[1] } });
    expect(a.centerPx).toEqual(b.centerPx);
  });

  it("userScale 은 크기에 선형으로 작용하고 범위를 벗어나면 클램프된다", () => {
    const base = geoAt([800, 1000], { userScale: 1 }).widthPx;
    expect(geoAt([800, 1000], { userScale: 1.2 }).widthPx).toBeCloseTo(base * 1.2, 6);
    expect(geoAt([800, 1000], { userScale: 9 }).widthPx).toBeCloseTo(base * 1.5, 6);
    expect(geoAt([800, 1000], { userScale: 0.01 }).widthPx).toBeCloseTo(base * 0.5, 6);
  });

  it("실제 폭이 없으면 이미지 폭 기반 기본 크기를 쓴다", () => {
    const g = geoAt([800, 1000], { material: { ...TOILET, real_width_mm: null } });
    expect(g.widthPx).toBeCloseTo(IMAGE_WIDTH / 5, 6);
  });
});

describe("solveFixtureGeometry — 설치 높이", () => {
  it("벽걸이 세면기는 접지점보다 위로 올라간다", () => {
    const pos: Point = [800, 1000];
    const basin: FixtureMaterialSpec = {
      kind: "basin",
      real_width_mm: 600,
      real_height_mm: 500,
      anchor_x: 0.5,
      anchor_y: 1,
      mount_type: "wall",
    };
    const wall = geoAt(pos, { material: basin });
    const floorMounted = geoAt(pos, { material: { ...basin, mount_type: "floor" } });
    expect(wall.centerPx[1]).toBeLessThan(floorMounted.centerPx[1]);

    const s = pxPerMmAt(makeFloor(), pos, IMAGE_WIDTH);
    expect(floorMounted.centerPx[1] - wall.centerPx[1]).toBeCloseTo(800 * s.mean, 6);
  });

  it("수동 오프셋이 기본 설치 높이에 더해진다", () => {
    expect(mountHeightMm({ ...TOILET, kind: "basin", mount_type: "wall" }, 100)).toBe(900);
    expect(mountHeightMm({ ...TOILET, mount_type: "floor" }, 100)).toBe(100);
  });

  it("mount_type 이 비어 있으면 종류별 기본 설치 방식을 쓴다", () => {
    expect(mountTypeOf(null, "toilet")).toBe("floor");
    expect(mountTypeOf(null, "basin")).toBe("wall");
    expect(mountTypeOf("countertop", "basin")).toBe("countertop");
    expect(mountTypeOf(null, "tile_floor")).toBe("floor");
  });
});

describe("solveFixtureGeometry — 접지 그림자", () => {
  it("그림자는 접지점에 놓이고 가로로 납작하다", () => {
    const pos: Point = [800, 1000];
    const g = geoAt(pos);
    expect(g.shadow.center).toEqual(pos);
    expect(g.shadow.radiusY).toBeLessThan(g.shadow.radiusX);
    expect(g.shadow.alpha).toBeCloseTo(0.35, 6);
  });

  it("그림자 폭은 도기 폭에 비례한다", () => {
    const near = geoAt([800, 1120]);
    const far = geoAt([800, 730]);
    expect(near.shadow.radiusX / near.widthPx).toBeCloseTo(far.shadow.radiusX / far.widthPx, 6);
  });

  it("바닥에 닿지 않는 설치 방식은 그림자가 작고 옅다", () => {
    const pos: Point = [800, 1000];
    const onFloor = geoAt(pos);
    const onWall = geoAt(pos, { material: { ...TOILET, mount_type: "wall" } });
    expect(onWall.shadow.radiusX).toBeLessThan(onFloor.shadow.radiusX);
    expect(onWall.shadow.alpha).toBeLessThan(onFloor.shadow.alpha);
  });

  it("바닥이 눕혀 보일수록 그림자가 더 납작하다 (foreshorten ≤ 1)", () => {
    const g = geoAt([800, 1000]);
    expect(g.foreshorten).toBeGreaterThan(0);
    expect(g.foreshorten).toBeLessThanOrEqual(1);
  });
});

describe("imagePointToFixtureUv", () => {
  it("스프라이트 안의 점은 0~1 UV 로, 밖의 점은 null 로", () => {
    const g = geoAt([800, 1000]);
    const inside = imagePointToFixtureUv(g, g.centerPx, false);
    expect(inside).not.toBeNull();
    expect(inside![0]).toBeCloseTo(0.5, 6);
    expect(inside![1]).toBeCloseTo(0.5, 6);

    expect(imagePointToFixtureUv(g, [g.centerPx[0] + g.widthPx, g.centerPx[1]], false)).toBeNull();
  });

  it("좌우 반전은 U 를 뒤집는다", () => {
    const g = geoAt([800, 1000]);
    const p: Point = [g.centerPx[0] + g.widthPx * 0.25, g.centerPx[1]];
    const normal = imagePointToFixtureUv(g, p, false)!;
    const flipped = imagePointToFixtureUv(g, p, true)!;
    expect(normal[0]).toBeCloseTo(0.75, 6);
    expect(flipped[0]).toBeCloseTo(0.25, 6);
  });

  it("회전된 스프라이트도 로컬 좌표로 되돌린다", () => {
    const g = geoAt([800, 1000], { rotationDeg: 90 });
    const uv = imagePointToFixtureUv(g, g.centerPx, false);
    expect(uv![0]).toBeCloseTo(0.5, 6);
    expect(uv![1]).toBeCloseTo(0.5, 6);
  });
});
