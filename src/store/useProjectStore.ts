import { create } from "zustand";
import { polygonCentroid, type Point } from "@/lib/geometry";
import type { Material, TilePattern } from "@/types/material";
import { isObjectKind, isTileKind } from "@/types/material";
import type { ObjectPlacement, TilePlacement } from "@/types/placement";
import type { SurfaceRow } from "@/types/surface";

/** 실행취소 단계 상한 — 마스킹 에디터(MaskEditor)와 동일 */
const MAX_HISTORY = 50;

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

/** 실행취소 스냅샷 — 배치 상태만 담는다 (조명은 SceneControls 가 별도로 되돌린다) */
export interface PlacementSnapshot {
  tilePlacements: TilePlacement[];
  objectPlacements: ObjectPlacement[];
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
  past: PlacementSnapshot[];
  future: PlacementSnapshot[];

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

  // ---- 위생도기 (Phase 8) ----
  selectObject: (id: string | null) => void;
  /** 위생도기 자재를 바닥 중앙(또는 지정 위치)에 배치한다 */
  applyObject: (material: Material, at?: Point) => void;
  updateObjectPlacement: (id: string, patch: Partial<Omit<ObjectPlacement, "id" | "material_id">>, options?: { history?: boolean }) => void;
  removeObjectPlacement: (id: string) => void;

  // ---- 실행취소 (Phase 9) ----
  /** 다음 변경 전에 현재 배치를 히스토리에 쌓는다 (드래그처럼 시작 시점에만 기록할 때) */
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function snapshotOf(s: ProjectState): PlacementSnapshot {
  return { tilePlacements: s.tilePlacements, objectPlacements: s.objectPlacements };
}

/** 변경 결과에 히스토리 push 를 얹는다 (past 상한 초과분은 앞에서 버린다) */
function withHistory(s: ProjectState, next: Partial<ProjectState>): Partial<ProjectState> {
  const past = [...s.past, snapshotOf(s)].slice(-MAX_HISTORY);
  return { ...next, past, future: [], revision: s.revision + 1 };
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
  past: [],
  future: [],

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
      past: [],
      future: [],
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
    set(
      withHistory(state, {
        materials: { ...state.materials, [material.id]: material },
        tilePlacements: [...state.tilePlacements.filter((p) => p.surface_id !== targetId), next],
      }),
    );
  },

  updateTilePlacement: (placementId, patch) =>
    set((s) =>
      withHistory(s, {
        tilePlacements: s.tilePlacements.map((p) => (p.id === placementId ? { ...p, ...patch } : p)),
      }),
    ),

  removeTilePlacement: (surfaceId) =>
    set((s) => withHistory(s, { tilePlacements: s.tilePlacements.filter((p) => p.surface_id !== surfaceId) })),

  replaceTilePlacements: (list) => set((s) => withHistory(s, { tilePlacements: list })),
  setObjectPlacements: (list) => set((s) => withHistory(s, { objectPlacements: list })),

  // ---------- 위생도기 ----------
  selectObject: (id) => set((s) => (s.selectedObjectId === id ? s : { selectedObjectId: id })),

  applyObject: (material, at) => {
    const state = get();
    if (!isObjectKind(material.kind) || !material.cutout_url) return;

    // 놓을 위치: 지정 좌표 > 바닥 폴리곤 중심 > 화면 중앙 하단
    const floor = state.surfaces.find((s) => s.surface_type === "floor");
    const project = state.project;
    let pos: Point = at ?? [0.5, 0.75];
    if (!at && floor && project) {
      const c = polygonCentroid(floor.polygon);
      pos = [c[0] / Math.max(1, project.width_px), c[1] / Math.max(1, project.height_px)];
    }

    const next: ObjectPlacement = {
      id: newId(),
      material_id: material.id,
      pos_x: clamp01(pos[0]),
      pos_y: clamp01(pos[1]),
      scale: 1,
      rotation: 0,
      flip_x: false,
      z_order: state.objectPlacements.length,
    };
    set(
      withHistory(state, {
        materials: { ...state.materials, [material.id]: material },
        objectPlacements: [...state.objectPlacements, next],
        selectedObjectId: next.id,
      }),
    );
  },

  updateObjectPlacement: (id, patch, options) => {
    const history = options?.history ?? true;
    set((s) => {
      const objectPlacements = s.objectPlacements.map((p) => (p.id === id ? { ...p, ...patch } : p));
      // 드래그 중에는 history:false 로 호출해 프레임마다 히스토리가 쌓이지 않게 한다
      return history ? withHistory(s, { objectPlacements }) : { objectPlacements, revision: s.revision + 1 };
    });
  },

  removeObjectPlacement: (id) =>
    set((s) =>
      withHistory(s, {
        objectPlacements: s.objectPlacements.filter((p) => p.id !== id),
        selectedObjectId: s.selectedObjectId === id ? null : s.selectedObjectId,
      }),
    ),

  // ---------- 실행취소 ----------
  pushHistory: () => set((s) => ({ past: [...s.past, snapshotOf(s)].slice(-MAX_HISTORY), future: [] })),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return {
        ...prev,
        past: s.past.slice(0, -1),
        future: [snapshotOf(s), ...s.future].slice(0, MAX_HISTORY),
        selectedObjectId: prev.objectPlacements.some((p) => p.id === s.selectedObjectId) ? s.selectedObjectId : null,
        revision: s.revision + 1,
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return s;
      return {
        ...next,
        past: [...s.past, snapshotOf(s)].slice(-MAX_HISTORY),
        future: s.future.slice(1),
        selectedObjectId: next.objectPlacements.some((p) => p.id === s.selectedObjectId) ? s.selectedObjectId : null,
        revision: s.revision + 1,
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

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
