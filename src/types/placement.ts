import type { Tables, TablesInsert } from "@/types/database.types";
import type { TilePattern } from "@/types/material";

export type PlacementRow = Tables<"placements">;
export type PlacementInsert = TablesInsert<"placements">;

/** 타일 배치 (surface 에 자재 적용) */
export interface TilePlacement {
  id: string;
  surface_id: string;
  material_id: string;
  pattern: TilePattern;
  offset_x_mm: number;
  offset_y_mm: number;
  rotate_deg: number;
  grout_override: string | null;
  z_order: number;
}

/** 위생도기(오브젝트) 배치 — Phase 8 */
export interface ObjectPlacement {
  id: string;
  material_id: string;
  pos_x: number;
  pos_y: number;
  scale: number;
  rotation: number;
  flip_x: boolean;
  z_order: number;
}

export const PATTERN_VALUES: TilePattern[] = ["grid", "brick", "brick_1_3", "herringbone", "stack", "diagonal"];

export function patternOf(value: string | null | undefined): TilePattern {
  return PATTERN_VALUES.includes(value as TilePattern) ? (value as TilePattern) : "grid";
}

export function tilePlacementFromRow(row: PlacementRow): TilePlacement | null {
  if (!row.surface_id) return null;
  return {
    id: row.id,
    surface_id: row.surface_id,
    material_id: row.material_id,
    pattern: patternOf(row.pattern),
    offset_x_mm: Number(row.offset_x_mm ?? 0),
    offset_y_mm: Number(row.offset_y_mm ?? 0),
    rotate_deg: Number(row.rotate_deg ?? 0),
    grout_override: row.grout_override ?? null,
    z_order: row.z_order ?? 0,
  };
}

export function objectPlacementFromRow(row: PlacementRow): ObjectPlacement | null {
  if (row.surface_id || row.pos_x === null || row.pos_y === null) return null;
  return {
    id: row.id,
    material_id: row.material_id,
    pos_x: Number(row.pos_x),
    pos_y: Number(row.pos_y),
    scale: Number(row.scale ?? 1),
    rotation: Number(row.rotation ?? 0),
    flip_x: Boolean(row.flip_x),
    z_order: row.z_order ?? 0,
  };
}

export function tilePlacementToRow(projectId: string, p: TilePlacement): PlacementInsert {
  return {
    id: p.id,
    project_id: projectId,
    material_id: p.material_id,
    surface_id: p.surface_id,
    pattern: p.pattern,
    offset_x_mm: p.offset_x_mm,
    offset_y_mm: p.offset_y_mm,
    rotate_deg: p.rotate_deg,
    grout_override: p.grout_override,
    z_order: p.z_order,
    pos_x: null,
    pos_y: null,
  };
}

export function objectPlacementToRow(projectId: string, p: ObjectPlacement): PlacementInsert {
  return {
    id: p.id,
    project_id: projectId,
    material_id: p.material_id,
    surface_id: null,
    pos_x: p.pos_x,
    pos_y: p.pos_y,
    scale: p.scale,
    rotation: p.rotation,
    flip_x: p.flip_x,
    z_order: p.z_order,
  };
}
