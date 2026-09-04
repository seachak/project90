import type { BrowserSupabaseClient } from "@/lib/supabase/client";
import type { HueBucket, Material, MaterialKind } from "@/types/material";
import { isTileKind } from "@/types/material";

export interface MaterialQuery {
  kind: MaterialKind | "all";
  search: string;
  hue: HueBucket | null;
  size: { w: number; h: number } | null;
  page: number;
  pageSize?: number;
  /** 내 자재만 */
  ownerId?: string | null;
}

export const DEFAULT_PAGE_SIZE = 24;

/** 자재 목록 조회 (페이지 단위, 무한 스크롤용) */
export async function fetchMaterials(
  supabase: BrowserSupabaseClient,
  query: MaterialQuery,
): Promise<{ items: Material[]; hasMore: boolean }> {
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = query.page * pageSize;
  // hasMore 판정을 위해 한 개 더 가져온다
  const to = from + pageSize;

  let q = supabase.from("materials").select("*");
  if (query.kind !== "all") q = q.eq("kind", query.kind);
  if (query.ownerId) q = q.eq("owner_id", query.ownerId);
  const search = query.search.trim().replace(/[%,()]/g, " ").trim();
  if (search) {
    q = q.or(`name.ilike.%${search}%,brand.ilike.%${search}%,model_code.ilike.%${search}%`);
  }
  if (query.hue) q = q.contains("meta", { hue_bucket: query.hue });
  if (query.size) q = q.eq("tile_width_mm", query.size.w).eq("tile_height_mm", query.size.h);

  const { data, error } = await q.order("created_at", { ascending: false }).range(from, to);
  if (error) throw error;
  const items = data ?? [];
  return { items: items.slice(0, pageSize), hasMore: items.length > pageSize };
}

export async function fetchMaterial(
  supabase: BrowserSupabaseClient,
  id: string,
): Promise<Material | null> {
  const { data, error } = await supabase.from("materials").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** 태그 자동완성용: 사용 빈도순 태그 목록 */
export async function fetchTagSuggestions(supabase: BrowserSupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("materials").select("tags").limit(500);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    for (const tag of row.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}

export function formatPrice(price: number | null | undefined, currency = "KRW"): string {
  if (price === null || price === undefined) return "가격 미정";
  try {
    return new Intl.NumberFormat("ko-KR", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      price,
    );
  } catch {
    return `${price.toLocaleString()} ${currency}`;
  }
}

export function formatTileSize(m: Pick<Material, "tile_width_mm" | "tile_height_mm">): string | null {
  if (!m.tile_width_mm || !m.tile_height_mm) return null;
  return `${m.tile_width_mm}×${m.tile_height_mm}`;
}

export function formatObjectSize(
  m: Pick<Material, "real_width_mm" | "real_height_mm" | "real_depth_mm">,
): string | null {
  const parts = [m.real_width_mm, m.real_height_mm, m.real_depth_mm];
  if (parts.every((p) => !p)) return null;
  return parts.map((p) => (p ? String(p) : "–")).join("×");
}

/** 카드/목록에서 보여줄 대표 이미지 */
export function materialImageUrl(m: Material): string | null {
  return m.thumbnail_url ?? (isTileKind(m.kind) ? m.texture_url : m.cutout_url) ?? null;
}

/** 렌더링에 쓰는 원본 이미지 */
export function materialSourceUrl(m: Material): string | null {
  return (isTileKind(m.kind) ? m.texture_url : m.cutout_url) ?? m.thumbnail_url ?? null;
}
