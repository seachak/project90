"use client";

import { useEffect } from "react";
import { useProjectStore } from "@/store/useProjectStore";

/** 입력 중이면 단축키를 가로채지 않는다 */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
}

/** 방향키 1회 이동량 (이미지 픽셀). Shift 를 누르면 10배 */
const NUDGE_PX = 1;

/**
 * 시뮬레이터 전역 단축키.
 *  - Ctrl/⌘+Z 실행취소, Ctrl/⌘+Shift+Z · Ctrl+Y 다시실행
 *  - 도기 선택 상태: 방향키 미세이동(Shift 10px), Delete/Backspace 삭제, Esc 선택 해제
 */
export function useSimulatorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const store = useProjectStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
        return;
      }

      const id = store.selectedObjectId;
      if (!id) return;

      if (e.key === "Escape") {
        e.preventDefault();
        store.selectObject(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.removeObjectPlacement(id);
        return;
      }

      const step = (e.shiftKey ? NUDGE_PX * 10 : NUDGE_PX);
      const delta =
        e.key === "ArrowLeft" ? [-step, 0] :
        e.key === "ArrowRight" ? [step, 0] :
        e.key === "ArrowUp" ? [0, -step] :
        e.key === "ArrowDown" ? [0, step] :
        null;
      if (!delta) return;

      const project = store.project;
      const placement = store.objectPlacements.find((p) => p.id === id);
      if (!project || !placement) return;
      e.preventDefault();
      store.updateObjectPlacement(id, {
        pos_x: clamp01(placement.pos_x + delta[0] / project.width_px),
        pos_y: clamp01(placement.pos_y + delta[1] / project.height_px),
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
