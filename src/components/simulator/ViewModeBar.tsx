"use client";

import { Columns2, Image as ImageIcon, SlidersHorizontal } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useViewerStore, type ViewMode } from "@/store/useViewerStore";
import { cn } from "@/lib/utils";

/** 헤더의 [BEFORE][AFTER][슬라이더][분할][실제 시공본] 토글 */
export function ViewModeBar({ className }: { className?: string }) {
  const mode = useViewerStore((s) => s.mode);
  const setMode = useViewerStore((s) => s.setMode);
  const hasActual = useViewerStore((s) => s.hasActual);
  const holdBefore = useViewerStore((s) => s.holdBefore);

  return (
    <ToggleGroup
      value={[holdBefore ? "before" : mode]}
      onValueChange={(v) => {
        const next = (v as ViewMode[])[0];
        if (next) setMode(next);
      }}
      variant="outline"
      size="sm"
      spacing={0}
      className={cn(className)}
      aria-label="Before / After 보기"
    >
      <ToggleGroupItem value="before" title="시공 전 (B)" className="px-2 font-semibold tracking-wide">
        BEFORE
      </ToggleGroupItem>
      <ToggleGroupItem value="after" title="시뮬레이션 (A)" className="px-2 font-semibold tracking-wide">
        AFTER
      </ToggleGroupItem>
      <ToggleGroupItem value="slider" title="슬라이더 비교">
        <SlidersHorizontal className="size-4" />
        <span className="hidden sm:inline">슬라이더</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="split" title="좌우 분할">
        <Columns2 className="size-4" />
        <span className="hidden sm:inline">분할</span>
      </ToggleGroupItem>
      {hasActual && (
        <ToggleGroupItem value="actual" title="실제 시공 후 사진">
          <ImageIcon className="size-4" />
          <span className="hidden sm:inline">실제 시공본</span>
        </ToggleGroupItem>
      )}
    </ToggleGroup>
  );
}
