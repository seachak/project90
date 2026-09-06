"use client";

/**
 * 로컬 자재 보관소 (IndexedDB).
 *
 * Supabase 없이 실물 자재를 등록해 바로 시뮬레이터에 올려보기 위한 경로다.
 * 이미지는 Blob 그대로 저장하고, 화면에 쓸 때만 object URL 로 바꿔 준다
 * (object URL 은 새로고침하면 무효가 되므로 DB 에 넣지 않는다).
 *
 * ⚠️ 이 브라우저에만 남는다 — 다른 기기·다른 브라우저에서는 보이지 않고,
 *    사이트 데이터를 지우면 함께 사라진다. 공유가 필요하면 Supabase 를 붙여야 한다.
 */
import { localDb, MATERIALS_STORE as STORE } from "@/lib/localDb";
import type { Material, MaterialInsert } from "@/types/material";

/** 로컬 자재 id 접두사. URL 경로에 그대로 쓰이므로 인코딩이 필요한 문자는 넣지 않는다 */
export const LOCAL_ID_PREFIX = "local_";

export function isLocalMaterial(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

interface LocalRecord {
  id: string;
  /** texture_url / cutout_url / thumbnail_url 은 비워 두고 blob 에서 만든다 */
  material: Material;
  blob: Blob;
  thumb: Blob | null;
  created_at: number;
}

const db = localDb;

/** id → object URL. 같은 자재를 다시 읽어도 URL 이 바뀌지 않게 캐시한다 */
const urlCache = new Map<string, { source: string; thumb: string }>();

function urlsFor(record: LocalRecord): { source: string; thumb: string } {
  const cached = urlCache.get(record.id);
  if (cached) return cached;
  const source = URL.createObjectURL(record.blob);
  const thumb = record.thumb ? URL.createObjectURL(record.thumb) : source;
  const entry = { source, thumb };
  urlCache.set(record.id, entry);
  return entry;
}

function revokeUrls(id: string): void {
  const entry = urlCache.get(id);
  if (!entry) return;
  URL.revokeObjectURL(entry.source);
  if (entry.thumb !== entry.source) URL.revokeObjectURL(entry.thumb);
  urlCache.delete(id);
}

/** 저장된 레코드 → 화면·렌더러가 쓰는 Material (URL 채워서) */
function toMaterial(record: LocalRecord): Material {
  const { source, thumb } = urlsFor(record);
  const isTile = record.material.kind === "tile_floor" || record.material.kind === "tile_wall";
  return {
    ...record.material,
    id: record.id,
    texture_url: isTile ? source : null,
    cutout_url: isTile ? null : source,
    thumbnail_url: thumb,
  };
}

export interface SaveLocalMaterialInput {
  insert: MaterialInsert;
  blob: Blob;
  thumb: Blob | null;
}

export async function saveLocalMaterial(input: SaveLocalMaterialInput): Promise<Material> {
  const id = `${LOCAL_ID_PREFIX}${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  // Material 은 DB 행 타입이라 빠진 필드를 기본값으로 채워 둔다
  const material: Material = {
    id,
    kind: input.insert.kind,
    name: input.insert.name,
    brand: input.insert.brand ?? null,
    model_code: input.insert.model_code ?? null,
    texture_url: null,
    cutout_url: null,
    thumbnail_url: null,
    tile_width_mm: input.insert.tile_width_mm ?? null,
    tile_height_mm: input.insert.tile_height_mm ?? null,
    is_seamless: input.insert.is_seamless ?? null,
    grout_color: input.insert.grout_color ?? null,
    grout_width_mm: input.insert.grout_width_mm ?? null,
    anchor_x: input.insert.anchor_x ?? null,
    anchor_y: input.insert.anchor_y ?? null,
    real_width_mm: input.insert.real_width_mm ?? null,
    real_height_mm: input.insert.real_height_mm ?? null,
    real_depth_mm: input.insert.real_depth_mm ?? null,
    mount_type: input.insert.mount_type ?? null,
    finish: input.insert.finish ?? null,
    gloss: input.insert.gloss ?? null,
    base_color: input.insert.base_color ?? null,
    price: input.insert.price ?? null,
    currency: input.insert.currency ?? "KRW",
    tags: input.insert.tags ?? [],
    meta: input.insert.meta ?? {},
    owner_id: null,
    is_public: false,
    created_at: now,
    updated_at: now,
  };

  const record: LocalRecord = { id, material, blob: input.blob, thumb: input.thumb, created_at: Date.now() };
  const database = await db();
  await database.put(STORE, record);
  return toMaterial(record);
}

/** 최근 등록순 */
export async function listLocalMaterials(): Promise<Material[]> {
  try {
    const database = await db();
    const records = (await database.getAll(STORE)) as LocalRecord[];
    return records.sort((a, b) => b.created_at - a.created_at).map(toMaterial);
  } catch (err) {
    console.warn("로컬 자재를 읽지 못했습니다", err);
    return [];
  }
}

export async function deleteLocalMaterial(id: string): Promise<void> {
  const database = await db();
  await database.delete(STORE, id);
  revokeUrls(id);
}

export async function countLocalMaterials(): Promise<number> {
  try {
    const database = await db();
    return await database.count(STORE);
  } catch {
    return 0;
  }
}
