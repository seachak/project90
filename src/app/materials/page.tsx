import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = { title: "자재 라이브러리" };

export default function MaterialsPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <h1 className="mb-6 text-xl font-semibold">자재 라이브러리</h1>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
          <Layers className="size-8 text-muted-foreground" />
          <p className="font-medium">자재 등록·목록 기능은 다음 단계에서 제공됩니다</p>
          <p className="text-sm text-muted-foreground">
            타일(바닥·벽), 양변기, 세면기, 욕조, 수전, 액세서리를 등록하고 검색할 수 있습니다.
          </p>
        </div>
      </main>
    </>
  );
}
