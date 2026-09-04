import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";

export const metadata: Metadata = { title: "새 프로젝트" };

export default function NewProjectPage() {
  return (
    <>
      <AppHeader />
      <main>
        <ProjectCreateForm />
      </main>
    </>
  );
}
