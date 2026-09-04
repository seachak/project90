"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, PencilRuler } from "lucide-react";
import { SimulatorCanvas } from "@/components/canvas/SimulatorCanvas";
import { EstimatePanel } from "@/components/panels/EstimatePanel";
import { LayerPanel } from "@/components/panels/LayerPanel";
import { MaterialLibrary } from "@/components/panels/MaterialLibrary";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { SceneRenderer } from "@/lib/render/renderer";
import { materialSourceUrl } from "@/lib/materials/queries";
import { useProjectStore, type ProjectInfo, type RenderSurface } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import type { Material } from "@/types/material";
import type { ObjectPlacement, TilePlacement } from "@/types/placement";

export interface SimulatorProps {
  project: ProjectInfo;
  surfaces: RenderSurface[];
  materials: Material[];
  tilePlacements: TilePlacement[];
  objectPlacements: ObjectPlacement[];
  /** 데모 모드: 정적 자재 목록 */
  staticMaterials?: Material[];
  mode: "supabase" | "demo";
}

/**
 * 메인 시뮬레이터 레이아웃
 * ┌ 헤더 ─────────────────────────────────────────┐
 * │ 자재 라이브러리 │ 캔버스 (줌/팬) │ 조명·채도 / 견적 │
 * │                 │ 레이어 패널     │                 │
 */
export function Simulator({ project, surfaces, materials, tilePlacements, objectPlacements, staticMaterials, mode }: SimulatorProps) {
  const init = useProjectStore((s) => s.init);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const [shading, setShading] = useState(100);

  useEffect(() => {
    init({ project, surfaces, materials: [...materials, ...(staticMaterials ?? [])], tilePlacements, objectPlacements });
  }, [init, project, surfaces, materials, tilePlacements, objectPlacements, staticMaterials]);

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Link href={mode === "demo" ? "/" : "/projects"} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">90</span>
        </Link>
        <span className="truncate text-sm font-medium">{project.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">BEFORE / AFTER 비교는 Phase 6</span>
          {mode === "supabase" && (
            <Link href={`/projects/${project.id}/mask`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <PencilRuler className="size-4" data-icon="inline-start" />
              표면 마스킹
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="order-2 h-64 w-full shrink-0 border-t md:order-1 md:h-auto md:w-72 md:border-t-0 md:border-r">
          <MaterialLibrary
            staticMaterials={staticMaterials}
            onPreload={(m) => rendererRef.current?.preload(materialSourceUrl(m))}
          />
        </aside>

        <main className="order-1 flex min-h-0 min-w-0 flex-1 flex-col md:order-2">
          <div className="relative min-h-0 flex-1">
            <SimulatorCanvas onRendererReady={(r) => (rendererRef.current = r)} />
          </div>
          <div className="h-28 shrink-0 border-t">
            <LayerPanel />
          </div>
        </main>

        <aside className="order-3 hidden w-72 shrink-0 flex-col border-l lg:flex">
          <div className="flex-1 border-b p-3 text-xs text-muted-foreground">
            <h3 className="mb-2 font-semibold text-foreground">조명 · 채도</h3>
            <div className="mb-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-foreground">원본 조명 합성 (shading)</Label>
                <span className="tabular-nums">{shading}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                value={shading}
                onValueChange={(v) => {
                  const next = Array.isArray(v) ? v[0] : v;
                  setShading(next);
                  rendererRef.current?.setShadingStrength(next / 100);
                }}
                aria-label="조명 합성 강도"
              />
              <p>원본 사진의 명암(그림자·원근 감쇠)을 새 타일 위에 곱합니다. 0 이면 끔.</p>
            </div>
            밝기 · 노출 · 대비 · 채도 · 색온도 · 프리셋은 Phase 7 에서 제공됩니다.
          </div>
          <EstimatePanel className="max-h-72 overflow-y-auto" />
        </aside>
      </div>
    </div>
  );
}
