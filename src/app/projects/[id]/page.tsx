import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Layers, PencilRuler } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { resolveImageUrl } from "@/lib/projects/images";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { SURFACE_COLORS, surfaceTypeOf } from "@/types/surface";

export const metadata: Metadata = { title: "프로젝트" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: project }, { data: surfaces }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("surfaces").select("id, label, surface_type, quad, real_width_mm, real_height_mm, editor").eq("project_id", id).order("z_order"),
  ]);
  if (!project) notFound();
  const imageUrl = await resolveImageUrl(supabase, project.base_url ?? project.before_url);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <Link href="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          프로젝트 목록
        </Link>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[project.client_name, project.address].filter(Boolean).join(" · ") || "고객·주소 미입력"}
              {project.width_px && ` · ${project.width_px}×${project.height_px}px`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/projects/${id}/mask`} className={cn(buttonVariants({ variant: "outline" }))}>
              <PencilRuler className="size-4" data-icon="inline-start" />
              표면 마스킹
            </Link>
            <span className={cn(buttonVariants(), "pointer-events-none opacity-60")} title="Phase 4 에서 제공">
              <Layers className="size-4" data-icon="inline-start" />
              시뮬레이터 (준비 중)
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-xl border bg-muted">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={project.name} className="w-full object-contain" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted-foreground">사진이 없습니다</div>
            )}
          </div>
          <aside className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">표면 ({surfaces?.length ?? 0})</h2>
            {(surfaces?.length ?? 0) === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                아직 벽/바닥 영역이 없습니다. <Link href={`/projects/${id}/mask`} className="underline underline-offset-4">표면 마스킹</Link>에서 지정하세요.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {surfaces!.map((s) => {
                  const type = surfaceTypeOf(s.surface_type);
                  const editor = (s.editor ?? {}) as { quad_auto?: boolean };
                  return (
                    <li key={s.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="size-3 rounded-sm" style={{ backgroundColor: SURFACE_COLORS[type] }} />
                      <span className="flex-1 truncate">{s.label}</span>
                      {s.real_width_mm && s.real_height_mm && (
                        <span className="text-xs text-muted-foreground">
                          {s.real_width_mm}×{s.real_height_mm}mm
                        </span>
                      )}
                      <Badge variant={editor.quad_auto ? "destructive" : "secondary"}>{editor.quad_auto ? "원근 미지정" : "원근 ✓"}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
