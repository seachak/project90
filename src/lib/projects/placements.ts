/**
 * 시뮬레이터 배치 상태 저장 (Phase 9).
 *
 * 타일과 위생도기는 같은 `placements` 테이블을 쓰고 `surface_id` 유무로 구분된다
 * (types/placement.ts 의 변환기 참고). 자동 저장에서 호출하므로 upsert + 사라진 행 삭제로
 * 처리해 전체 삭제 후 재삽입에서 오는 깜빡임·id 변경을 피한다.
 */
import type { BrowserSupabaseClient } from "@/lib/supabase/client";
import type { SceneSettings } from "@/lib/render/colorGrade";
import {
  objectPlacementToRow,
  tilePlacementToRow,
  type ObjectPlacement,
  type TilePlacement,
} from "@/types/placement";

/** 호버 미리보기용 임시 배치 id — 저장 대상이 아니다 */
const PREVIEW_ID = "__hover__";

export async function savePlacements(
  supabase: BrowserSupabaseClient,
  projectId: string,
  tiles: TilePlacement[],
  objects: ObjectPlacement[],
): Promise<{ saved: number }> {
  const rows = [
    ...tiles.filter((p) => p.id !== PREVIEW_ID).map((p) => tilePlacementToRow(projectId, p)),
    ...objects.map((p) => objectPlacementToRow(projectId, p)),
  ];
  const keepIds = rows.map((r) => r.id).filter((id): id is string => Boolean(id));

  if (rows.length > 0) {
    const { error } = await supabase.from("placements").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }

  // 이 프로젝트에서 사라진 배치를 정리한다
  let del = supabase.from("placements").delete().eq("project_id", projectId);
  if (keepIds.length > 0) del = del.not("id", "in", `(${keepIds.join(",")})`);
  const { error } = await del;
  if (error) throw error;

  return { saved: rows.length };
}

/** 조명·채도 설정 저장 (project_id 가 PK 인 1:1 테이블) */
export async function saveSceneSettings(
  supabase: BrowserSupabaseClient,
  projectId: string,
  settings: SceneSettings,
): Promise<void> {
  const { error } = await supabase.from("scene_settings").upsert(
    {
      project_id: projectId,
      brightness: settings.brightness,
      contrast: settings.contrast,
      saturation: settings.saturation,
      temperature: settings.temperature,
      tint: settings.tint,
      exposure: settings.exposure,
      shadow_lift: settings.shadow_lift,
      light_preset: settings.light_preset,
      vignette: settings.vignette,
    },
    { onConflict: "project_id" },
  );
  if (error) throw error;
}
