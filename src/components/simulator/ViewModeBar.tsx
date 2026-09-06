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
      className={cn("shrink-0", className)}
      aria-label="Before / After 보기"
    >
      <ToggleGroupItem value="before" title="시공 전 (B 또는 ←)" className="px-1.5 font-semibold tracking-wide sm:px-2">
        BEFORE
      </ToggleGroupItem>
      <ToggleGroupItem value="after" title="시뮬레이션 (A 또는 →)" className="px-1.5 font-semibold tracking-wide sm:px-2">
        AFTER
      </ToggleGroupItem>
      <ToggleGroupItem value="slider" title="슬라이더 비교">
        <SlidersHorizontal className="size-4" />
        <span className="hidden sm:inline">슬라이더</span>
      </ToggleGroupItem>
      {/* 좌우 분할은 좁은 화면에서 각 뷰가 너무 작아져 숨긴다 */}
      <ToggleGroupItem value="split" title="좌우 분할" className="hidden sm:inline-flex">
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
