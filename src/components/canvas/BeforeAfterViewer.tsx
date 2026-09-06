"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { SimulatorCanvas } from "@/components/canvas/SimulatorCanvas";
import type { SceneRenderer } from "@/lib/render/renderer";
import { useProjectStore } from "@/store/useProjectStore";
import { useViewerStore } from "@/store/useViewerStore";
import { cn } from "@/lib/utils";

interface BeforeAfterViewerProps {
  className?: string;
  onRendererReady?: (renderer: SceneRenderer) => void;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
}

/**
 * Before/After 뷰어 — 캔버스 위에 슬라이더 핸들·라벨 오버레이와 단축키(B/A/Space) 를 얹는다.
 * 실제 합성(두 레이어 스택 + opacity/마스크)은 렌더러가 담당하므로 전환 시 깜빡임이 없다.
 */
export function BeforeAfterViewer({ className, onRendererReady }: BeforeAfterViewerProps) {
  const mode = useViewerStore((s) => s.mode);
  const sliderX = useViewerStore((s) => s.sliderX);
  const holdBefore = useViewerStore((s) => s.holdBefore);
  const setMode = useViewerStore((s) => s.setMode);
  const setSliderX = useViewerStore((s) => s.setSliderX);
  const setHoldBefore = useViewerStore((s) => s.setHoldBefore);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // 단축키: B / A / Space(홀드)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.code === "Space") {
        if (!e.repeat) setHoldBefore(true);
        e.preventDefault();
      } else if (e.key === "b" || e.key === "B") setMode("before");
      else if (e.key === "a" || e.key === "A") setMode("after");
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // 방향키는 ① 슬라이더 핸들에 포커스가 있으면 핸들 이동, ② 도기가 선택돼 있으면 도기 미세이동,
        // ③ 그 외에는 BEFORE ↔ AFTER 전환 (스펙: before/after 토글 ←/→ 지원)
        if ((document.activeElement as HTMLElement | null)?.getAttribute("role") === "slider") return;
        if (useProjectStore.getState().selectedObjectId) return;
        e.preventDefault();
        setMode(e.key === "ArrowLeft" ? "before" : "after");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setHoldBefore(false);
    };
    const blur = () => setHoldBefore(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [setMode, setHoldBefore]);

  const fractionFromEvent = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return sliderX;
    return (clientX - rect.left) / rect.width;
  };

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSliderX(fractionFromEvent(e.clientX));
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setSliderX(fractionFromEvent(e.clientX));
  };
  const onHandleUp = () => {
    dragging.current = false;
  };

  const showingBefore = holdBefore || mode === "before";

  return (
    <div ref={ref} className={cn("relative h-full w-full", className)}>
      <SimulatorCanvas onRendererReady={onRendererReady} />

      {/* 라벨 */}
      <div className="pointer-events-none absolute top-2 left-2 flex gap-1">
        {mode === "split" ? (
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">BEFORE</span>
        ) : (
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
            {showingBefore ? "BEFORE" : mode === "actual" ? "실제 시공본" : mode === "slider" ? "BEFORE ◂ ▸ AFTER" : "AFTER"}
            {holdBefore && " (Space)"}
          </span>
        )}
      </div>
      {mode === "split" && (
        <span className="pointer-events-none absolute top-2 left-1/2 ml-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
          AFTER
        </span>
      )}
      {mode === "split" && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/70" />}

      {/* 슬라이더 핸들 */}
      {mode === "slider" && !holdBefore && (
        <div
          role="slider"
          aria-label="Before/After 슬라이더"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(sliderX * 100)}
          tabIndex={0}
          className="absolute inset-y-0 z-10 -ml-3 w-6 cursor-ew-resize touch-none"
          style={{ left: `${sliderX * 100}%` }}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setSliderX(sliderX - 0.02);
            if (e.key === "ArrowRight") setSliderX(sliderX + 0.02);
          }}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow" />
          <div className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/60 text-[10px] text-white shadow">
            ◂▸
          </div>
        </div>
      )}
    </div>
  );
}
