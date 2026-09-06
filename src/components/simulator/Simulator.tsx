"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeft, PencilRuler } from "lucide-react";
import { BeforeAfterViewer } from "@/components/canvas/BeforeAfterViewer";
import { ViewModeBar } from "@/components/simulator/ViewModeBar";
import { EstimatePanel } from "@/components/panels/EstimatePanel";
import { LayerPanel } from "@/components/panels/LayerPanel";
import { MaterialLibrary } from "@/components/panels/MaterialLibrary";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSimulatorShortcuts } from "@/hooks/use-simulator-shortcuts";
import { useAutosave } from "@/hooks/use-autosave";
import { SimulatorActions } from "@/components/simulator/SimulatorActions";
import { MobilePanels } from "@/components/simulator/MobilePanels";
import { SceneControls } from "@/components/panels/SceneControls";
import { buttonVariants } from "@/components/ui/button";
import type { SceneSettings } from "@/lib/render/colorGrade";
import type { SceneRenderer } from "@/lib/render/renderer";
import { materialSourceUrl } from "@/lib/materials/queries";
import { useProjectStore, type ProjectInfo, type RenderSurface } from "@/store/useProjectStore";
import { useSceneStore } from "@/store/useSceneStore";
import { useViewerStore } from "@/store/useViewerStore";
import { cn } from "@/lib/utils";
import type { Material } from "@/types/material";
import type { ObjectPlacement, TilePlacement } from "@/types/placement";

export interface SimulatorProps {
  project: ProjectInfo;
  surfaces: RenderSurface[];
  materials: Material[];
  tilePlacements: TilePlacement[];
  objectPlacements: ObjectPlacement[];
  /** 저장된 조명·채도 설정 (없으면 기본값) */
  sceneSettings?: Partial<Record<keyof SceneSettings, unknown>> | null;
  /** 데모 모드: 정적 자재 목록 */
  staticMaterials?: Material[];
  mode: "supabase" | "demo" | "local";
}

/**
 * 메인 시뮬레이터 레이아웃
 * ┌ 헤더 ─────────────────────────────────────────┐
 * │ 자재 라이브러리 │ 캔버스 (줌/팬) │ 조명·채도 / 견적 │
 * │                 │ 레이어 패널     │                 │
 */
export function Simulator({ project, surfaces, materials, tilePlacements, objectPlacements, sceneSettings, staticMaterials, mode }: SimulatorProps) {
  const init = useProjectStore((s) => s.init);
  const initScene = useSceneStore((s) => s.init);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const setHasActual = useViewerStore((s) => s.setHasActual);
  useSimulatorShortcuts();
  const autosave = useAutosave(mode === "supabase" ? "supabase" : mode === "local" ? "local" : "off");

  useEffect(() => {
    init({ project, surfaces, materials: [...materials, ...(staticMaterials ?? [])], tilePlacements, objectPlacements });
    initScene(sceneSettings ?? null);
    setHasActual(Boolean(project.afterImageUrl));
  }, [init, initScene, project, surfaces, materials, tilePlacements, objectPlacements, sceneSettings, staticMaterials, setHasActual]);

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:gap-3 sm:px-3">
        <Link href={mode === "demo" ? "/" : "/projects"} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">90</span>
        </Link>
        <span className="hidden truncate text-sm font-medium sm:inline">{project.name}</span>
        {/* 좁은 화면에서는 헤더가 꽉 차므로 캔버스 위 오버레이로 내린다 */}
        <ViewModeBar className="ml-1 hidden sm:flex" />
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <SimulatorActions
            mode={mode}
            getRenderer={() => rendererRef.current}
            saveStatus={autosave.status}
            savedAt={autosave.savedAt}
            onSaveNow={autosave.saveNow}
          />
          {mode === "supabase" && (
            <Link href={`/projects/${project.id}/mask`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden md:inline-flex")}>
              <PencilRuler className="size-4" data-icon="inline-start" />
              표면 마스킹
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 lg:flex-row">
        {/* lg 미만에서는 좌·우 사이드바 대신 하단 바텀시트로 접근한다 (캔버스가 화면을 최대한 쓰도록) */}
        <aside className="hidden w-72 shrink-0 border-r lg:block">
          <MaterialLibrary
            staticMaterials={staticMaterials}
            onPreload={(m) => rendererRef.current?.preload(materialSourceUrl(m))}
          />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <BeforeAfterViewer onRendererReady={(r) => (rendererRef.current = r)} />
            <ViewModeBar className="absolute bottom-3 left-1/2 flex -translate-x-1/2 bg-background/90 shadow-lg backdrop-blur sm:hidden" />
          </div>
          <div className="hidden h-28 shrink-0 border-t lg:block">
            <LayerPanel />
          </div>
          <MobilePanels
            className="lg:hidden"
            staticMaterials={staticMaterials}
            onPreload={(m) => rendererRef.current?.preload(materialSourceUrl(m))}
          />
        </main>

        <aside className="hidden w-72 shrink-0 flex-col border-l lg:flex">
          <SceneControls className="min-h-0 flex-1 overflow-y-auto border-b" />
          <EstimatePanel className="max-h-64 shrink-0 overflow-y-auto" />
        </aside>
      </div>
    </div>
  );
}
