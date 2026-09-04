import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MaskEditor } from "@/components/canvas/MaskEditor";
import { resolveImageUrl } from "@/lib/projects/images";
import { createClient } from "@/lib/supabase/server";
import { toEditableSurface } from "@/types/surface";

export const metadata: Metadata = { title: "표면 마스킹" };

export default async function MaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: project }, { data: surfaces }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("surfaces").select("*").eq("project_id", id).order("z_order"),
  ]);
  if (!project) notFound();
  const imageUrl = await resolveImageUrl(supabase, project.base_url ?? project.before_url);
  if (!imageUrl || !project.width_px || !project.height_px) redirect(`/projects/${id}`);

  return (
    <MaskEditor
      projectId={project.id}
      projectName={project.name}
      imageUrl={imageUrl}
      imageWidth={project.width_px}
      imageHeight={project.height_px}
      initialSurfaces={(surfaces ?? []).map(toEditableSurface)}
      mode="supabase"
    />
  );
}
