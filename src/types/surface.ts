import type { Point, PathVertex } from "@/lib/geometry";
import type { Tables, TablesInsert } from "@/types/database.types";

export type SurfaceRow = Tables<"surfaces">;
export type SurfaceInsert = TablesInsert<"surfaces">;

export type SurfaceType = "floor" | "wall" | "ceiling";

export const SURFACE_TYPE_OPTIONS: { value: SurfaceType; label: string; color: string }[] = [
  { value: "floor", label: "바닥", color: "#3b82f6" },
  { value: "wall", label: "벽", color: "#f97316" },
  { value: "ceiling", label: "천장", color: "#22c55e" },
];

export const SURFACE_COLORS: Record<SurfaceType, string> = {
  floor: "#3b82f6",
  wall: "#f97316",
  ceiling: "#22c55e",
};

export const DEFAULT_LABELS: Record<SurfaceType, string[]> = {
  floor: ["바닥"],
  wall: ["정면벽", "좌측벽", "우측벽", "벽"],
  ceiling: ["천장"],
};

/** surfaces.editor jsonb 에 저장하는 편집 상태 */
export interface SurfaceEditorState {
  vertices: PathVertex[];
  closed: boolean;
  source: "polygon" | "wand";
  quad_auto?: boolean;
  wand?: { tolerance: number; seed: Point };
}

/** 에디터에서 다루는 표면 (DB 행 + 편집 상태) */
export interface EditableSurface {
  id: string;
  label: string;
  surface_type: SurfaceType;
  vertices: PathVertex[];
  closed: boolean;
  quad: Point[] | null;
  real_width_mm: number | null;
  real_height_mm: number | null;
  z_order: number;
  source: "polygon" | "wand";
  isNew: boolean;
}

export function surfaceTypeOf(value: string | null | undefined): SurfaceType {
  return value === "wall" || value === "ceiling" ? value : "floor";
}

/** DB 행 → 에디터 표면 */
export function toEditableSurface(row: SurfaceRow): EditableSurface {
  const editor = (row.editor ?? {}) as Partial<SurfaceEditorState>;
  const polygon = Array.isArray(row.polygon) ? (row.polygon as Point[]) : [];
  const vertices: PathVertex[] =
    editor.vertices && editor.vertices.length >= 3
      ? editor.vertices
      : polygon.map(([x, y]) => ({ x, y }));
  const quad = Array.isArray(row.quad) && (row.quad as Point[]).length === 4 && !editor.quad_auto ? (row.quad as Point[]) : null;
  return {
    id: row.id,
    label: row.label,
    surface_type: surfaceTypeOf(row.surface_type),
    vertices,
    closed: editor.closed ?? vertices.length >= 3,
    quad,
    real_width_mm: row.real_width_mm,
    real_height_mm: row.real_height_mm,
    z_order: row.z_order ?? 0,
    source: editor.source ?? "polygon",
    isNew: false,
  };
}
