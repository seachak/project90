"use client";

import { useState } from "react";
import { Layers, Package, Receipt, SunMedium } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EstimatePanel } from "@/components/panels/EstimatePanel";
import { LayerPanel } from "@/components/panels/LayerPanel";
import { MaterialLibrary } from "@/components/panels/MaterialLibrary";
import { SceneControls } from "@/components/panels/SceneControls";
import type { Material } from "@/types/material";
import { cn } from "@/lib/utils";

type TabId = "materials" | "layers" | "scene" | "estimate";

const TABS: { id: TabId; label: string; description: string; icon: typeof Package }[] = [
  { id: "materials", label: "자재", description: "적용할 타일과 위생도기를 고릅니다", icon: Package },
  { id: "layers", label: "레이어", description: "표면과 배치된 도기의 옵션을 조절합니다", icon: Layers },
  { id: "scene", label: "조명", description: "조명과 채도를 조절합니다", icon: SunMedium },
  { id: "estimate", label: "견적", description: "적용한 자재의 매수와 금액입니다", icon: Receipt },
];

interface MobilePanelsProps {
  className?: string;
  staticMaterials?: Material[];
  onPreload?: (material: Material) => void;
}

/**
 * 모바일(<lg) 전용 하단 탭바 + 바텀시트.
 * 데스크톱에서는 같은 패널들이 좌·우 사이드바에 상주하므로 이 컴포넌트는 숨겨진다.
 */
export function MobilePanels({ className, staticMaterials, onPreload }: MobilePanelsProps) {
  const [open, setOpen] = useState<TabId | null>(null);
  const active = TABS.find((t) => t.id === open) ?? null;

  return (
    <>
      <nav className={cn("flex items-stretch border-t bg-background", className)} aria-label="패널 전환">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setOpen((cur) => (cur === tab.id ? null : tab.id))}
              aria-expanded={open === tab.id}
              aria-label={tab.label}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors",
                open === tab.id ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        {/* 베이스 스타일의 data-[side=bottom]:h-auto 를 이기려면 같은 변형 접두사를 써야 한다 */}
        <SheetContent side="bottom" className="gap-0 p-0 data-[side=bottom]:h-[68svh]">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>{active?.label ?? ""}</SheetTitle>
            <SheetDescription>{active?.description ?? ""}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {open === "materials" && <MaterialLibrary className="h-full" staticMaterials={staticMaterials} onPreload={onPreload} />}
            {open === "layers" && <LayerPanel className="h-full" />}
            {open === "scene" && <SceneControls className="h-full" />}
            {open === "estimate" && <EstimatePanel className="h-full" />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
