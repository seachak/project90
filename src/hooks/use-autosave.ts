"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { savePlacements, saveSceneSettings } from "@/lib/projects/placements";
import { updateLocalProject } from "@/lib/projects/localStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useSceneStore } from "@/store/useSceneStore";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** 어디에 저장할지 — off 는 데모 모드 */
export type AutosaveTarget = "supabase" | "local" | "off";

export interface AutosaveState {
  status: SaveStatus;
  savedAt: Date | null;
  error: string | null;
  /** 지금 즉시 저장 (저장 버튼 등) */
  saveNow: () => void;
}

const DEBOUNCE_MS = 800;

/**
 * 배치·조명 변경을 디바운스해 Supabase 에 저장한다.
 * 데모 모드(`enabled: false`)에서는 아무것도 하지 않는다.
 *
 * 두 스토어의 revision 을 함께 본다 — 배치는 placements, 조명은 scene_settings 로 나뉘어 저장된다.
 */
export function useAutosave(target: AutosaveTarget): AutosaveState {
  const enabled = target !== "off";
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 저장이 진행 중일 때 들어온 변경 — 끝나고 한 번 더 돌린다 */
  const pending = useRef(false);
  const running = useRef(false);

  const flush = useRef(async () => {});
  flush.current = async () => {
    const project = useProjectStore.getState().project;
    if (!project) return;
    if (running.current) {
      pending.current = true;
      return;
    }
    running.current = true;
    setStatus("saving");
    try {
      const p = useProjectStore.getState();
      const scene = useSceneStore.getState().settings;
      if (target === "local") {
        await updateLocalProject(project.id, {
          tilePlacements: p.tilePlacements.filter((t) => t.id !== "__hover__"),
          objectPlacements: p.objectPlacements,
          scene,
        });
      } else {
        const supabase = createClient();
        await savePlacements(supabase, project.id, p.tilePlacements, p.objectPlacements);
        await saveSceneSettings(supabase, project.id, scene);
      }
      setStatus("saved");
      setSavedAt(new Date());
      setError(null);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      running.current = false;
      if (pending.current) {
        pending.current = false;
        void flush.current();
      }
    }
  };

  useEffect(() => {
    if (!enabled) return;
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush.current(), DEBOUNCE_MS);
    };
    // init() 직후의 revision 0 은 저장하지 않는다 (읽어온 값을 그대로 되쓰는 낭비)
    let lastProject = useProjectStore.getState().revision;
    let lastScene = useSceneStore.getState().revision;
    const unsubProject = useProjectStore.subscribe((s) => {
      if (s.revision === lastProject) return;
      lastProject = s.revision;
      if (s.revision > 0) schedule();
    });
    const unsubScene = useSceneStore.subscribe((s) => {
      if (s.revision === lastScene) return;
      lastScene = s.revision;
      if (s.revision > 0) schedule();
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubProject();
      unsubScene();
    };
  }, [enabled]);
  // target 이 바뀌는 경우는 없지만(마운트 시 고정) flush 가 최신 값을 보도록 참조에 담아 둔다

  return {
    status,
    savedAt,
    error,
    saveNow: () => {
      if (!enabled) return;
      if (timer.current) clearTimeout(timer.current);
      void flush.current();
    },
  };
}
