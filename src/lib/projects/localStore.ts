"use client";

/**
 * 로컬 프로젝트 보관소 (IndexedDB).
 *
 * Supabase 없이 내 현장 사진을 올려 마스킹하고 자재를 얹어보기 위한 경로다.
 * 사진은 Blob 그대로 두고 화면에 쓸 때만 object URL 로 바꾼다.
 *
 * 표면은 DB 행과 같은 모양(SurfaceInsert)으로 저장한다 — 그래야 기존 변환기
 * (surfaceToRow / toEditableSurface / toRenderSurface)를 Supabase 경로와 똑같이 쓸 수 있다.
 *
 * ⚠️ 이 브라우저에만 남는다. 사이트 데이터를 지우면 사라지고 다른 기기에서는 보이지 않는다.
 */
import { localDb, PROJECTS_STORE as STORE } from "@/lib/localDb";
import type { SceneSettings } from "@/lib/render/colorGrade";
import type { ObjectPlacement, TilePlacement } from "@/types/placement";
import type { SurfaceInsert, SurfaceRow } from "@/types/surface";

/** 로컬 현장 id 접두사. URL 경로에 그대로 쓰이므로 인코딩이 필요한 문자는 넣지 않는다 */
export const LOCAL_PROJECT_PREFIX = "localproj_";

export function isLocalProject(id: string): boolean {
  return id.startsWith(LOCAL_PROJECT_PREFIX);
}

export interface LocalProjectRecord {
  id: string;
  name: string;
  photo: Blob;
  width_px: number;
  height_px: number;
  /** DB 행과 같은 모양 — 기존 변환기를 그대로 쓴다 */
  surfaces: SurfaceInsert[];
  tilePlacements: TilePlacement[];
  objectPlacements: ObjectPlacement[];
  scene: SceneSettings | null;
  created_at: number;
  updated_at: number;
}

/** 사진 URL 이 채워진 형태 */
export interface LocalProject extends Omit<LocalProjectRecord, "photo"> {
  imageUrl: string;
}

const db = localDb;

const urlCache = new Map<string, string>();

function imageUrlFor(record: LocalProjectRecord): string {
  const cached = urlCache.get(record.id);
  if (cached) return cached;
  const url = URL.createObjectURL(record.photo);
  urlCache.set(record.id, url);
  return url;
}

function toLocalProject(record: LocalProjectRecord): LocalProject {
  // photo(Blob)는 화면에서 쓰지 않는다 — object URL 로 바꿔 내보낸다
  const url = imageUrlFor(record);
  return {
    id: record.id,
    name: record.name,
    width_px: record.width_px,
    height_px: record.height_px,
    surfaces: record.surfaces,
    tilePlacements: record.tilePlacements,
    objectPlacements: record.objectPlacements,
    scene: record.scene,
    created_at: record.created_at,
    updated_at: record.updated_at,
    imageUrl: url,
  };
}

export async function createLocalProject(input: {
  name: string;
  photo: Blob;
  width_px: number;
  height_px: number;
}): Promise<LocalProject> {
  const now = Date.now();
  const record: LocalProjectRecord = {
    id: `${LOCAL_PROJECT_PREFIX}${crypto.randomUUID()}`,
    name: input.name.trim() || "새 현장",
    photo: input.photo,
    width_px: input.width_px,
    height_px: input.height_px,
    surfaces: [],
    tilePlacements: [],
    objectPlacements: [],
    scene: null,
    created_at: now,
    updated_at: now,
  };
  const database = await db();
  await database.put(STORE, record);
  return toLocalProject(record);
}

export async function getLocalProject(id: string): Promise<LocalProject | null> {
  try {
    const database = await db();
    const record = (await database.get(STORE, id)) as LocalProjectRecord | undefined;
    return record ? toLocalProject(record) : null;
  } catch (err) {
    console.warn("로컬 프로젝트를 읽지 못했습니다", err);
    return null;
  }
}

/** 최근 수정순 */
export async function listLocalProjects(): Promise<LocalProject[]> {
  try {
    const database = await db();
    const records = (await database.getAll(STORE)) as LocalProjectRecord[];
    return records.sort((a, b) => b.updated_at - a.updated_at).map(toLocalProject);
  } catch (err) {
    console.warn("로컬 프로젝트 목록을 읽지 못했습니다", err);
    return [];
  }
}

/** 사진은 그대로 두고 나머지 필드만 갱신한다 */
export async function updateLocalProject(
  id: string,
  patch: Partial<Pick<LocalProjectRecord, "name" | "surfaces" | "tilePlacements" | "objectPlacements" | "scene">>,
): Promise<void> {
  const database = await db();
  const record = (await database.get(STORE, id)) as LocalProjectRecord | undefined;
  if (!record) throw new Error("프로젝트를 찾을 수 없습니다.");
  await database.put(STORE, { ...record, ...patch, updated_at: Date.now() });
}

export async function deleteLocalProject(id: string): Promise<void> {
  const database = await db();
  await database.delete(STORE, id);
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

/** 저장된 SurfaceInsert → 렌더러·에디터가 쓰는 완전한 행 모양 */
export function toSurfaceRow(projectId: string, insert: SurfaceInsert): SurfaceRow {
  return {
    id: insert.id ?? crypto.randomUUID(),
    project_id: projectId,
    label: insert.label,
    surface_type: insert.surface_type,
    polygon: insert.polygon,
    quad: insert.quad,
    real_width_mm: insert.real_width_mm ?? null,
    real_height_mm: insert.real_height_mm ?? null,
    shading_url: insert.shading_url ?? null,
    z_order: insert.z_order ?? 0,
    editor: insert.editor ?? {},
    created_at: null,
  };
}
