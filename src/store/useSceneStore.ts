import { create } from "zustand";
import { DEFAULT_SCENE, LIGHT_PRESETS, applyPreset, normalizeScene, type SceneSettings } from "@/lib/render/colorGrade";

export interface UserPreset {
  name: string;
  settings: SceneSettings;
}

const USER_PRESETS_KEY = "project90:scene-presets";

function loadUserPresets(): UserPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USER_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserPreset[];
    return Array.isArray(parsed) ? parsed.map((p) => ({ name: String(p.name), settings: normalizeScene(p.settings) })) : [];
  } catch {
    return [];
  }
}

function persistUserPresets(list: UserPreset[]): void {
  try {
    window.localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(list));
  } catch {
    /* 저장 불가 환경 무시 */
  }
}

interface SceneState {
  settings: SceneSettings;
  /** "원본과 비교" 누르는 동안 보정 끔 */
  compareOriginal: boolean;
  /** 원본 조명(shading) 합성 강도 0~1 (클라이언트 전용) */
  shadingStrength: number;
  userPresets: UserPreset[];
  revision: number;
  init: (row: Partial<Record<keyof SceneSettings, unknown>> | null | undefined) => void;
  set: (patch: Partial<SceneSettings>) => void;
  reset: (key: keyof SceneSettings) => void;
  resetAll: () => void;
  applyLightPreset: (id: string) => void;
  setCompareOriginal: (on: boolean) => void;
  setShadingStrength: (v: number) => void;
  saveUserPreset: (name: string) => void;
  applyUserPreset: (name: string) => void;
  deleteUserPreset: (name: string) => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  settings: { ...DEFAULT_SCENE },
  compareOriginal: false,
  shadingStrength: 1,
  userPresets: [],
  revision: 0,

  init: (row) => set({ settings: normalizeScene(row), userPresets: loadUserPresets(), revision: 0 }),

  set: (patch) =>
    set((s) => ({
      settings: { ...s.settings, ...patch, light_preset: "light_preset" in patch ? (patch.light_preset as string) : "custom" },
      revision: s.revision + 1,
    })),

  reset: (key) =>
    set((s) => ({ settings: { ...s.settings, [key]: DEFAULT_SCENE[key], light_preset: "custom" }, revision: s.revision + 1 })),

  resetAll: () => set((s) => ({ settings: { ...DEFAULT_SCENE }, revision: s.revision + 1 })),

  applyLightPreset: (id) => {
    const preset = LIGHT_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    set((s) => ({ settings: applyPreset(preset), revision: s.revision + 1 }));
  },

  setCompareOriginal: (on) => set((s) => (s.compareOriginal === on ? s : { compareOriginal: on })),
  setShadingStrength: (v) => set({ shadingStrength: Math.min(1, Math.max(0, v)) }),

  saveUserPreset: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const list = [...get().userPresets.filter((p) => p.name !== trimmed), { name: trimmed, settings: { ...get().settings } }];
    persistUserPresets(list);
    set({ userPresets: list });
  },
  applyUserPreset: (name) => {
    const preset = get().userPresets.find((p) => p.name === name);
    if (!preset) return;
    set((s) => ({ settings: { ...preset.settings, light_preset: "custom" }, revision: s.revision + 1 }));
  },
  deleteUserPreset: (name) => {
    const list = get().userPresets.filter((p) => p.name !== name);
    persistUserPresets(list);
    set({ userPresets: list });
  },
}));
