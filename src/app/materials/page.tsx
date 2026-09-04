import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { MaterialLibraryView } from "@/components/materials/MaterialLibraryView";

export const metadata: Metadata = { title: "자재 라이브러리" };

export default function MaterialsPage() {
  return (
    <>
      <AppHeader />
      <main>
        <MaterialLibraryView />
      </main>
    </>
  );
}
