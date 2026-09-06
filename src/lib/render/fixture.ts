/**
 * 위생도기(오브젝트) 배치 기하 — Phase 8.
 *
 * 핵심 아이디어: 사진 속 도기 크기를 사용자가 직접 맞추게 하지 않는다.
 * 바닥 표면의 호모그래피(mm → 이미지 px)가 이미 있으므로, 접지점을 바닥 mm 좌표로 되돌린 뒤
 * 그 지점에서의 국소 배율(px/mm)을 야코비안으로 구하면 실제 폭(mm)만으로 정확한 픽셀 크기가 나온다.
 * 도기를 앞으로 끌면 배율이 커지고 뒤로 끌면 작아진다 — 원근이 자동으로 반영된다.
 *
 * 순수 함수 모듈(DOM·WebGL 의존 없음)이라 테스트에서 그대로 검증한다.
 */
import type { Point } from "@/lib/geometry";
import { applyHomography, localScale, type Mat3 } from "@/lib/render/homography";
import {
  DEFAULT_MOUNT_BY_KIND,
  DEFAULT_WALL_MOUNT_HEIGHT_MM,
  isObjectKind,
  type MaterialKind,
  type MountType,
} from "@/types/material";

/** 앵커가 지정되지 않은 자재의 기본 접지점 — 하단 중앙 */
export const DEFAULT_ANCHOR: Point = [0.5, 1];

/** 미세조정 슬라이더 범위 (자동 크기의 ±50%) */
export const MIN_USER_SCALE = 0.5;
export const MAX_USER_SCALE = 1.5;

/** 접지 그림자 기본값 */
export const SHADOW_WIDTH_RATIO = 1.05; // 도기 폭 대비 그림자 가로 지름
export const SHADOW_FLATNESS = 0.26; // 가로 대비 세로 (정면에서 본 납작함)
export const SHADOW_OPACITY = 0.35;

/** 바닥에 닿지 않는 설치 방식의 그림자 약화 계수 */
const OFF_FLOOR_SHADOW_SCALE = 0.7;
const OFF_FLOOR_SHADOW_ALPHA = 0.5;

/** 자동 배율을 구할 수 없을 때(바닥 표면 없음) 쓰는 폴백: 이미지 폭의 1/6 을 1000mm 로 간주 */
const FALLBACK_MM_PER_IMAGE_WIDTH = 6000;

export interface FloorPlane {
  /** mm → 이미지 px */
  H: Mat3;
  /** 이미지 px → mm */
  invH: Mat3;
}

/** solveFixtureGeometry 가 필요로 하는 자재 속성만 추린 것 */
export interface FixtureMaterialSpec {
  kind: MaterialKind;
  real_width_mm: number | null;
  real_height_mm: number | null;
  anchor_x: number | null;
  anchor_y: number | null;
  mount_type: string | null;
}

export interface FixtureGeometryInput {
  /** 기준 바닥면. null 이면 폴백 배율을 쓴다 */
  floor: FloorPlane | null;
  /** 접지점 (이미지 px) */
  posImage: Point;
  material: FixtureMaterialSpec;
  /** 컷아웃 PNG 의 가로/세로 비 */
  cutoutAspect: number;
  /** 사용자 미세조정 (1 = 자동 크기 그대로) */
  userScale: number;
  rotationDeg: number;
  /** 폴백 배율 계산용 */
  imageWidth: number;
  /** 벽걸이 설치 높이 수동 오프셋 (mm). 기본값에 더해진다 */
  mountOffsetMm?: number;
}

export interface FixtureGeometry {
  /** 스프라이트 중심 (이미지 px) */
  centerPx: Point;
  widthPx: number;
  heightPx: number;
  rotationRad: number;
  /** 접지점에서의 배율 (px/mm) */
  pxPerMm: number;
  /** sy/sx — 바닥면 단축률. 1 이면 정면, 작을수록 눕혀 본 바닥 */
  foreshorten: number;
  /** 그림자 타원 (이미지 px) */
  shadow: { center: Point; radiusX: number; radiusY: number; alpha: number };
}

export function mountTypeOf(value: string | null, kind: MaterialKind): MountType {
  if (value === "wall" || value === "countertop" || value === "floor") return value;
  return isObjectKind(kind) ? DEFAULT_MOUNT_BY_KIND[kind] : "floor";
}

/**
 * 접지점을 바닥에서 얼마나 들어올릴지(mm). 바닥 설치는 0.
 * 벽걸이·카운터탑은 종류별 표준 설치 높이(세면기 800, 수전 1000 …)를 쓰고 수동 오프셋을 더한다.
 */
export function mountHeightMm(material: FixtureMaterialSpec, extraMm = 0): number {
  const mount = mountTypeOf(material.mount_type, material.kind);
  if (mount === "floor") return extraMm;
  return (DEFAULT_WALL_MOUNT_HEIGHT_MM[material.kind] ?? 0) + extraMm;
}

/**
 * 접지점에서의 픽셀/mm 배율. 바닥 표면이 없으면 이미지 폭 기반 폴백.
 * 반환 sx/sy 는 각각 mm 가로/세로 1 단위가 화면에서 차지하는 픽셀 수.
 */
export function pxPerMmAt(floor: FloorPlane | null, posImage: Point, imageWidth: number): { sx: number; sy: number; mean: number } {
  if (!floor) {
    const s = imageWidth / FALLBACK_MM_PER_IMAGE_WIDTH;
    return { sx: s, sy: s, mean: s };
  }
  try {
    const mm = applyHomography(floor.invH, posImage);
    if (!Number.isFinite(mm[0]) || !Number.isFinite(mm[1])) throw new Error("invalid");
    const s = localScale(floor.H, mm);
    if (!Number.isFinite(s.mean) || s.mean <= 1e-9) throw new Error("degenerate");
    return s;
  } catch {
    const s = imageWidth / FALLBACK_MM_PER_IMAGE_WIDTH;
    return { sx: s, sy: s, mean: s };
  }
}

/**
 * 도기 스프라이트의 화면 기하를 푼다.
 * 실제 폭(mm) × 접지점 배율(px/mm) → 화면 폭(px). 사용자는 크기를 맞출 필요가 없다.
 */
export function solveFixtureGeometry(input: FixtureGeometryInput): FixtureGeometry {
  const { floor, posImage, material, cutoutAspect, userScale, rotationDeg, imageWidth, mountOffsetMm = 0 } = input;

  const scale = pxPerMmAt(floor, posImage, imageWidth);
  const user = clamp(userScale, MIN_USER_SCALE, MAX_USER_SCALE);

  // 실제 폭이 없는 자재는 이미지 폭의 1/5 정도를 기본 크기로 삼는다
  const realWidthMm = material.real_width_mm && material.real_width_mm > 0 ? material.real_width_mm : null;
  const widthPx = realWidthMm ? realWidthMm * scale.mean * user : (imageWidth / 5) * user;

  const aspect = Number.isFinite(cutoutAspect) && cutoutAspect > 0 ? cutoutAspect : 1;
  const heightPx = widthPx / aspect;

  // 앵커: 컷아웃 안에서 바닥에 닿는 지점의 정규화 위치. 스프라이트 중심을 역산한다
  const ax = finiteOr(material.anchor_x, DEFAULT_ANCHOR[0]);
  const ay = finiteOr(material.anchor_y, DEFAULT_ANCHOR[1]);

  // 벽걸이·카운터탑은 접지점에서 설치 높이만큼 들어올린다 (화면 위쪽 = -y)
  const liftMm = mountHeightMm(material, mountOffsetMm);
  const groundY = posImage[1] - liftMm * scale.mean;

  const centerPx: Point = [posImage[0] - (ax - 0.5) * widthPx, groundY - (ay - 0.5) * heightPx];

  const offFloor = mountTypeOf(material.mount_type, material.kind) !== "floor";
  const radiusX = (widthPx * SHADOW_WIDTH_RATIO * (offFloor ? OFF_FLOOR_SHADOW_SCALE : 1)) / 2;
  // 바닥면이 눕혀 보일수록(sy/sx 가 작을수록) 그림자도 납작해진다
  const foreshorten = clamp(scale.sy / (scale.sx || 1), 0.15, 1);

  return {
    centerPx,
    widthPx,
    heightPx,
    rotationRad: (rotationDeg * Math.PI) / 180,
    pxPerMm: scale.mean,
    foreshorten,
    shadow: {
      center: [posImage[0], posImage[1]],
      radiusX,
      radiusY: radiusX * SHADOW_FLATNESS * foreshorten * 2,
      alpha: SHADOW_OPACITY * (offFloor ? OFF_FLOOR_SHADOW_ALPHA : 1),
    },
  };
}

/** 회전·반전을 고려해 이미지 좌표를 스프라이트 로컬 UV(0~1)로 변환. 밖이면 null */
export function imagePointToFixtureUv(geo: FixtureGeometry, p: Point, flipX: boolean): Point | null {
  const dx = p[0] - geo.centerPx[0];
  const dy = p[1] - geo.centerPx[1];
  const cos = Math.cos(-geo.rotationRad);
  const sin = Math.sin(-geo.rotationRad);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  let u = lx / geo.widthPx + 0.5;
  const v = ly / geo.heightPx + 0.5;
  if (flipX) u = 1 - u;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return [u, v];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
