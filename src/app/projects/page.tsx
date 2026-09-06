import type { Metadata } from "next";
import Link from "next/link";
import { FolderOpen, ImageIcon, Plus } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { buttonVariants } from "@/components/ui/button";
import { resolveImageUrls, thumbPathOf } from "@/lib/projects/images";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { LocalProjectList } from "@/components/projects/LocalProjects";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "프로젝트" };

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function ProjectsPage() {
  // Supabase 가 없으면 이 브라우저에 저장된 현장을 보여준다
  if (!hasSupabaseEnv()) return <LocalProjectList />;
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, client_name, address, before_url, updated_at")
    .order("updated_at", { ascending: false });

  const list = projects ?? [];
  const thumbs = await resolveImageUrls(
    supabase,
    list.map((p) => (p.before_url ? thumbPathOf(p.before_url) : null)),
  );
  const fallbacks = await resolveImageUrls(
    supabase,
    list.map((p, i) => (thumbs[i] ? null : p.before_url)),
  );

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">프로젝트</h1>
          <Link href="/projects/new" className={cn(buttonVariants())}>
            <Plus className="size-4" data-icon="inline-start" />새 프로젝트
          </Link>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            프로젝트를 불러오지 못했습니다: {error.message}
          </p>
        )}

        {!error && list.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
            <FolderOpen className="size-8 text-muted-foreground" />
            <p className="font-medium">아직 프로젝트가 없습니다</p>
            <p className="text-sm text-muted-foreground">시공 전 현장 사진을 올려 첫 프로젝트를 만들어 보세요.</p>
            <Link href="/projects/new" className={cn(buttonVariants({ variant: "outline" }))}>
              현장 사진 업로드
            </Link>
          </div>
        )}

        {list.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((project, i) => {
              const img = thumbs[i] ?? fallbacks[i];
              return (
                <li key={project.id}>
                  <Link href={`/projects/${project.id}`} className="group block overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/30">
                    <div className="relative aspect-[4/3] w-full bg-muted">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="size-6" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="truncate font-medium">{project.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[project.client_name, project.address].filter(Boolean).join(" · ") || "고객·주소 미입력"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(project.updated_at)}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
