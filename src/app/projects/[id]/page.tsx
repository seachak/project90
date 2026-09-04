import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Simulator } from "@/components/simulator/Simulator";
import { AppHeader } from "@/components/app-header";
import { buttonVariants } from "@/components/ui/button";
import { resolveImageUrl } from "@/lib/projects/images";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { toRenderSurface } from "@/store/useProjectStore";
import type { Material } from "@/types/material";
import { objectPlacementFromRow, tilePlacementFromRow } from "@/types/placement";

export const metadata: Metadata = { title: "시뮬레이터" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: project }, { data: surfaceRows }, { data: placementRows }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("surfaces").select("*").eq("project_id", id).order("z_order"),
    supabase.from("placements").select("*").eq("project_id", id).order("z_order"),
  ]);
  if (!project) notFound();

  const imageUrl = await resolveImageUrl(supabase, project.base_url ?? project.before_url);
  const surfaces = (surfaceRows ?? []).map(toRenderSurface).filter((s): s is NonNullable<typeof s> => s !== null);

  if (!imageUrl || !project.width_px || !project.height_px || surfaces.length === 0) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            {!imageUrl ? "시공 전 사진이 없습니다." : "아직 벽/바닥 표면이 지정되지 않았습니다. 마스킹 에디터에서 영역과 원근 4점을 지정하면 시뮬레이터가 열립니다."}
          </p>
          <Link href={`/projects/${id}/mask`} className={cn(buttonVariants())}>
            표면 마스킹 열기
          </Link>
        </main>
      </>
    );
  }

  const rows = placementRows ?? [];
  const tilePlacements = rows.map(tilePlacementFromRow).filter((p): p is NonNullable<typeof p> => p !== null);
  const objectPlacements = rows.map(objectPlacementFromRow).filter((p): p is NonNullable<typeof p> => p !== null);
  const materialIds = [...new Set(rows.map((r) => r.material_id))];
  let materials: Material[] = [];
  if (materialIds.length > 0) {
    const { data } = await supabase.from("materials").select("*").in("id", materialIds);
    materials = data ?? [];
  }
  const afterImageUrl = await resolveImageUrl(supabase, project.after_url);

  return (
    <Simulator
      project={{ id: project.id, name: project.name, width_px: project.width_px, height_px: project.height_px, imageUrl, afterImageUrl }}
      surfaces={surfaces}
      materials={materials}
      tilePlacements={tilePlacements}
      objectPlacements={objectPlacements}
      mode="supabase"
    />
  );
}
