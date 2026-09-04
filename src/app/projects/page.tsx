import type { Metadata } from "next";
import Link from "next/link";
import { FolderOpen, Plus } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "프로젝트" };

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, client_name, address, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-8">
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

        {!error && (projects?.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
            <FolderOpen className="size-8 text-muted-foreground" />
            <p className="font-medium">아직 프로젝트가 없습니다</p>
            <p className="text-sm text-muted-foreground">
              시공 전 현장 사진을 올려 첫 프로젝트를 만들어 보세요.
            </p>
            <Link href="/projects/new" className={cn(buttonVariants({ variant: "outline" }))}>
              현장 사진 업로드
            </Link>
          </div>
        )}

        {(projects?.length ?? 0) > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects!.map((project) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className="block h-full">
                  <Card className="h-full transition-colors hover:bg-muted/40">
                    <CardHeader>
                      <CardTitle className="truncate">{project.name}</CardTitle>
                      <CardDescription>
                        {[project.client_name, project.address].filter(Boolean).join(" · ") ||
                          "고객·주소 미입력"}
                        <br />
                        <span className="text-xs">{formatDate(project.updated_at)}</span>
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
