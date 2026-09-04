import { create } from "zustand";
import type { ViewMode } from "@/lib/render/renderer";

export type { ViewMode };

interface ViewerState {
  mode: ViewMode;
  /** 슬라이더 위치 (뷰포트 폭 대비 0~1) */
  sliderX: number;
  /** 스페이스바 홀드 중 (임시 BEFORE) */
  holdBefore: boolean;
  /** 실제 시공 후 사진이 있는지 */
  hasActual: boolean;
  setMode: (mode: ViewMode) => void;
  setSliderX: (x: number) => void;
  setHoldBefore: (hold: boolean) => void;
  setHasActual: (has: boolean) => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  mode: "after",
  sliderX: 0.5,
  holdBefore: false,
  hasActual: false,
  setMode: (mode) => set({ mode }),
  setSliderX: (x) => set({ sliderX: Math.min(1, Math.max(0, x)) }),
  setHoldBefore: (hold) => set((s) => (s.holdBefore === hold ? s : { holdBefore: hold })),
  setHasActual: (has) => set({ hasActual: has }),
}));
