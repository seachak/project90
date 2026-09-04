import { flattenPath, orderQuad, polygonBounds, type Point } from "@/lib/geometry";
import type { BrowserSupabaseClient } from "@/lib/supabase/client";
import type { EditableSurface, SurfaceEditorState, SurfaceInsert } from "@/types/surface";

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 폴리곤 바운딩 박스를 quad(좌상,우상,우하,좌하)로 */
export function bboxQuad(polygon: readonly Point[]): Point[] {
  const b = polygonBounds(polygon);
  return [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
    [b.minX, b.maxY],
  ];
}

export function surfacePolygon(s: EditableSurface): Point[] {
  return flattenPath(s.vertices, true).map(([x, y]) => [round1(x), round1(y)]);
}

/** 에디터 표면 → DB 행. 폴리곤이 3점 미만이면 null */
export function surfaceToRow(projectId: string, s: EditableSurface, shadingUrl?: string | null): SurfaceInsert | null {
  const polygon = surfacePolygon(s);
  if (polygon.length < 3) return null;
  const quadAuto = !s.quad || s.quad.length !== 4;
  const quad = (quadAuto ? bboxQuad(polygon) : orderQuad(s.quad!)).map(([x, y]) => [round1(x), round1(y)] as Point);
  const editor: SurfaceEditorState = {
    vertices: s.vertices.map((v) => ({
      x: round1(v.x),
      y: round1(v.y),
      ...(v.in ? { in: [round1(v.in[0]), round1(v.in[1])] as Point } : {}),
      ...(v.out ? { out: [round1(v.out[0]), round1(v.out[1])] as Point } : {}),
    })),
    closed: true,
    source: s.source,
    quad_auto: quadAuto,
  };
  return {
    id: s.id,
    project_id: projectId,
    label: s.label.trim() || "표면",
    surface_type: s.surface_type,
    polygon,
    quad,
    real_width_mm: s.real_width_mm,
    real_height_mm: s.real_height_mm,
    z_order: s.z_order,
    editor: JSON.parse(JSON.stringify(editor)),
    ...(shadingUrl !== undefined ? { shading_url: shadingUrl } : {}),
  };
}

export interface SaveSurfacesResult {
  saved: number;
  skipped: string[];
}

/** 표면 일괄 저장: upsert + 삭제 */
export async function saveSurfaces(
  supabase: BrowserSupabaseClient,
  projectId: string,
  surfaces: EditableSurface[],
  deletedIds: string[],
  shadingUrls: Record<string, string | null> = {},
): Promise<SaveSurfacesResult> {
  const rows: SurfaceInsert[] = [];
  const skipped: string[] = [];
  for (const s of surfaces) {
    const row = surfaceToRow(projectId, s, s.id in shadingUrls ? shadingUrls[s.id] : undefined);
    if (row) rows.push(row);
    else skipped.push(s.label);
  }
  if (deletedIds.length > 0) {
    const { error } = await supabase.from("surfaces").delete().in("id", deletedIds);
    if (error) throw error;
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("surfaces").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  return { saved: rows.length, skipped };
}
