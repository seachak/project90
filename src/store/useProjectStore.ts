import { create } from "zustand";
import type { Point } from "@/lib/geometry";
import type { Material, TilePattern } from "@/types/material";
import { isTileKind } from "@/types/material";
import type { ObjectPlacement, TilePlacement } from "@/types/placement";
import type { SurfaceRow } from "@/types/surface";

export interface ProjectInfo {
  id: string;
  name: string;
  width_px: number;
  height_px: number;
  imageUrl: string;
  afterImageUrl?: string | null;
}

/** 렌더러에 넘기는 표면 (DB 행에서 필요한 것만) */
export interface RenderSurface {
  id: string;
  label: string;
  surface_type: string;
  polygon: Point[];
  quad: Point[];
  real_width_mm: number;
  real_height_mm: number;
  shading_url: string | null;
  z_order: number;
}

export function toRenderSurface(row: SurfaceRow): RenderSurface | null {
  const polygon = Array.isArray(row.polygon) ? (row.polygon as Point[]) : [];
  const quad = Array.isArray(row.quad) ? (row.quad as Point[]) : [];
  if (polygon.length < 3 || quad.length !== 4) return null;
  // 실제 치수가 없으면 quad 픽셀 비율로 임시 치수(폭 3000mm 기준)를 만든다
  const wPx = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]);
  const hPx = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]);
  const realW = row.real_width_mm ?? 3000;
  const realH = row.real_height_mm ?? Math.max(300, Math.round((realW * hPx) / Math.max(1, wPx)));
  return {
    id: row.id,
    label: row.label,
    surface_type: row.surface_type,
    polygon,
    quad,
    real_width_mm: realW,
    real_height_mm: realH,
    shading_url: row.shading_url,
    z_order: row.z_order ?? 0,
  };
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export interface ProjectState {
  project: ProjectInfo | null;
  surfaces: RenderSurface[];
  materials: Record<string, Material>;
  tilePlacements: TilePlacement[];
  objectPlacements: ObjectPlacement[];
  selectedSurfaceId: string | null;
  selectedObjectId: string | null;
  hoverMaterialId: string | null;
  /** 변경 카운터 — 자동 저장 트리거용 */
  revision: number;

  init: (data: {
    project: ProjectInfo;
    surfaces: RenderSurface[];
    materials: Material[];
    tilePlacements: TilePlacement[];
    objectPlacements: ObjectPlacement[];
  }) => void;
  upsertMaterials: (list: Material[]) => void;
  selectSurface: (id: string | null) => void;
  setHoverMaterial: (id: string | null) => void;
  /** 선택된(또는 지정한) 표면에 타일 자재 적용 */
  applyTile: (material: Material, surfaceId?: string) => void;
  updateTilePlacement: (placementId: string, patch: Partial<Omit<TilePlacement, "id" | "surface_id">>) => void;
  removeTilePlacement: (surfaceId: string) => void;
  replaceTilePlacements: (list: TilePlacement[]) => void;
  setObjectPlacements: (list: ObjectPlacement[]) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  surfaces: [],
  materials: {},
  tilePlacements: [],
  objectPlacements: [],
  selectedSurfaceId: null,
  selectedObjectId: null,
  hoverMaterialId: null,
  revision: 0,

  init: ({ project, surfaces, materials, tilePlacements, objectPlacements }) =>
    set({
      project,
      surfaces: [...surfaces].sort((a, b) => a.z_order - b.z_order),
      materials: Object.fromEntries(materials.map((m) => [m.id, m])),
      tilePlacements,
      objectPlacements,
      selectedSurfaceId: surfaces.find((s) => s.surface_type === "floor")?.id ?? surfaces[0]?.id ?? null,
      selectedObjectId: null,
      hoverMaterialId: null,
      revision: 0,
    }),

  upsertMaterials: (list) =>
    set((s) => ({ materials: { ...s.materials, ...Object.fromEntries(list.map((m) => [m.id, m])) } })),

  selectSurface: (id) => set({ selectedSurfaceId: id, selectedObjectId: null }),

  setHoverMaterial: (id) => set((s) => (s.hoverMaterialId === id ? s : { hoverMaterialId: id })),

  applyTile: (material, surfaceId) => {
    const state = get();
    if (!isTileKind(material.kind)) return;
    const targetId = surfaceId ?? state.selectedSurfaceId;
    if (!targetId) return;
    const existing = state.tilePlacements.find((p) => p.surface_id === targetId);
    const next: TilePlacement = existing
      ? { ...existing, material_id: material.id }
      : {
          id: newId(),
          surface_id: targetId,
          material_id: material.id,
          pattern: "grid",
          offset_x_mm: 0,
          offset_y_mm: 0,
          rotate_deg: 0,
          grout_override: null,
          z_order: 0,
        };
    set({
      materials: { ...state.materials, [material.id]: material },
      tilePlacements: [...state.tilePlacements.filter((p) => p.surface_id !== targetId), next],
      revision: state.revision + 1,
    });
  },

  updateTilePlacement: (placementId, patch) =>
    set((s) => ({
      tilePlacements: s.tilePlacements.map((p) => (p.id === placementId ? { ...p, ...patch } : p)),
      revision: s.revision + 1,
    })),

  removeTilePlacement: (surfaceId) =>
    set((s) => ({ tilePlacements: s.tilePlacements.filter((p) => p.surface_id !== surfaceId), revision: s.revision + 1 })),

  replaceTilePlacements: (list) => set((s) => ({ tilePlacements: list, revision: s.revision + 1 })),
  setObjectPlacements: (list) => set((s) => ({ objectPlacements: list, revision: s.revision + 1 })),
}));

/** 호버 미리보기를 반영한 "실제로 렌더링할" 타일 배치 목록 */
export function effectiveTilePlacements(state: Pick<ProjectState, "tilePlacements" | "hoverMaterialId" | "selectedSurfaceId" | "materials">): TilePlacement[] {
  const { tilePlacements, hoverMaterialId, selectedSurfaceId, materials } = state;
  if (!hoverMaterialId || !selectedSurfaceId) return tilePlacements;
  const hover = materials[hoverMaterialId];
  if (!hover || !isTileKind(hover.kind)) return tilePlacements;
  const existing = tilePlacements.find((p) => p.surface_id === selectedSurfaceId);
  const preview: TilePlacement = existing
    ? { ...existing, material_id: hoverMaterialId }
    : {
        id: "__hover__",
        surface_id: selectedSurfaceId,
        material_id: hoverMaterialId,
        pattern: "grid" as TilePattern,
        offset_x_mm: 0,
        offset_y_mm: 0,
        rotate_deg: 0,
        grout_override: null,
        z_order: 0,
      };
  return [...tilePlacements.filter((p) => p.surface_id !== selectedSurfaceId), preview];
}
