import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
import { LocalProjectCreate } from "@/components/projects/LocalProjects";
import { hasSupabaseEnv } from "@/lib/env";

export const metadata: Metadata = { title: "새 프로젝트" };

export default function NewProjectPage() {
  if (!hasSupabaseEnv()) return <LocalProjectCreate />;
  return (
    <>
      <AppHeader />
      <main>
        <ProjectCreateForm />
      </main>
    </>
  );
}
