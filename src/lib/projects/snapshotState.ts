/**
 * 공유 스냅샷의 `state` jsonb 직렬화 / 파싱 (Phase 9).
 *
 * 공유 뷰어는 로그인하지 않은 익명 사용자다. RLS 상 비공개 자재(materials)나 표면(surfaces)을
 * 읽을 수 없으므로, 화면에 필요한 정보를 전부 state 안에 담아 자기완결적으로 만든다.
 * 반대로 원본 현장 사진(private `projects` 버킷)은 절대 넣지 않는다 —
 * 공유 화면은 `renders` 버킷에 올린 결과 PNG(snapshots.image_url) 하나만 보여준다.
 */
import type { SceneSettings } from "@/lib/render/colorGrade";
import { DEFAULT_SCENE, normalizeScene } from "@/lib/render/colorGrade";
import type { EstimateSummary } from "@/lib/estimate";
import type { Material } from "@/types/material";
import type { ObjectPlacement, TilePlacement } from "@/types/placement";
import type { RenderSurface } from "@/store/useProjectStore";

export const SNAPSHOT_VERSION = 1;

/** 공유 화면에 보여줄 자재 요약 (원본 행 전체를 넣지 않는다) */
export interface SnapshotMaterial {
  id: string;
  name: string;
  brand: string | null;
  kind: string;
  price: number | null;
  thumbnail_url: string | null;
  tile_width_mm: number | null;
  tile_height_mm: number | null;
  real_width_mm: number | null;
}

export interface SnapshotSurface {
  id: string;
  label: string;
  surface_type: string;
  real_width_mm: number;
  real_height_mm: number;
}

export interface SnapshotState {
  version: number;
  scene: SceneSettings;
  surfaces: SnapshotSurface[];
  materials: SnapshotMaterial[];
  tilePlacements: TilePlacement[];
  objectPlacements: ObjectPlacement[];
  estimate: EstimateSummary | null;
}

function toSnapshotMaterial(m: Material): SnapshotMaterial {
  return {
    id: m.id,
    name: m.name,
    brand: m.brand,
    kind: m.kind,
    price: m.price === null || m.price === undefined ? null : Number(m.price),
    thumbnail_url: m.thumbnail_url ?? m.texture_url ?? m.cutout_url ?? null,
    tile_width_mm: m.tile_width_mm,
    tile_height_mm: m.tile_height_mm,
    real_width_mm: m.real_width_mm,
  };
}

export interface BuildSnapshotInput {
  scene: SceneSettings;
  surfaces: RenderSurface[];
  materials: Record<string, Material>;
  tilePlacements: TilePlacement[];
  objectPlacements: ObjectPlacement[];
  estimate: EstimateSummary | null;
}

/** 현재 시뮬레이터 상태 → 공유용 state. 실제로 쓰인 자재만 담는다 */
export function buildSnapshotState(input: BuildSnapshotInput): SnapshotState {
  const usedIds = new Set<string>([
    ...input.tilePlacements.map((p) => p.material_id),
    ...input.objectPlacements.map((p) => p.material_id),
  ]);
  return {
    version: SNAPSHOT_VERSION,
    scene: input.scene,
    surfaces: input.surfaces.map((s) => ({
      id: s.id,
      label: s.label,
      surface_type: s.surface_type,
      real_width_mm: s.real_width_mm,
      real_height_mm: s.real_height_mm,
    })),
    materials: [...usedIds]
      .map((id) => input.materials[id])
      .filter((m): m is Material => Boolean(m))
      .map(toSnapshotMaterial),
    tilePlacements: input.tilePlacements.filter((p) => p.id !== "__hover__"),
    objectPlacements: input.objectPlacements,
    estimate: input.estimate,
  };
}

// ---------- 파싱 (외부에서 들어온 jsonb 는 신뢰하지 않는다) ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function num(v: unknown, fallback: number): number {
  return numOrNull(v) ?? fallback;
}

function array(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * DB 에서 읽은 jsonb → SnapshotState.
 * 필드가 깨져 있어도 화면이 죽지 않도록 전부 기본값으로 흡수한다.
 */
export function parseSnapshotState(raw: unknown): SnapshotState {
  const r = isRecord(raw) ? raw : {};
  return {
    version: num(r.version, SNAPSHOT_VERSION),
    scene: isRecord(r.scene) ? normalizeScene(r.scene) : DEFAULT_SCENE,
    surfaces: array(r.surfaces)
      .filter(isRecord)
      .map((s) => ({
        id: str(s.id),
        label: str(s.label, "표면"),
        surface_type: str(s.surface_type, "wall"),
        real_width_mm: num(s.real_width_mm, 0),
        real_height_mm: num(s.real_height_mm, 0),
      })),
    materials: array(r.materials)
      .filter(isRecord)
      .map((m) => ({
        id: str(m.id),
        name: str(m.name, "자재"),
        brand: typeof m.brand === "string" ? m.brand : null,
        kind: str(m.kind, "tile_floor"),
        price: numOrNull(m.price),
        thumbnail_url: typeof m.thumbnail_url === "string" ? m.thumbnail_url : null,
        tile_width_mm: numOrNull(m.tile_width_mm),
        tile_height_mm: numOrNull(m.tile_height_mm),
        real_width_mm: numOrNull(m.real_width_mm),
      })),
    tilePlacements: array(r.tilePlacements)
      .filter(isRecord)
      .map((p) => ({
        id: str(p.id),
        surface_id: str(p.surface_id),
        material_id: str(p.material_id),
        pattern: str(p.pattern, "grid") as TilePlacement["pattern"],
        offset_x_mm: num(p.offset_x_mm, 0),
        offset_y_mm: num(p.offset_y_mm, 0),
        rotate_deg: num(p.rotate_deg, 0),
        grout_override: typeof p.grout_override === "string" ? p.grout_override : null,
        z_order: num(p.z_order, 0),
      })),
    objectPlacements: array(r.objectPlacements)
      .filter(isRecord)
      .map((p) => ({
        id: str(p.id),
        material_id: str(p.material_id),
        pos_x: num(p.pos_x, 0.5),
        pos_y: num(p.pos_y, 0.5),
        scale: num(p.scale, 1),
        rotation: num(p.rotation, 0),
        flip_x: p.flip_x === true,
        z_order: num(p.z_order, 0),
      })),
    estimate: isRecord(r.estimate) ? (r.estimate as unknown as EstimateSummary) : null,
  };
}
