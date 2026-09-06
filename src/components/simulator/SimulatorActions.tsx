"use client";

import { useState } from "react";
import { Check, Download, Link2, Loader2, Redo2, RotateCcw, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildEstimate } from "@/lib/estimate";
import { buildSnapshotState } from "@/lib/projects/snapshotState";
import { saveSnapshot } from "@/lib/projects/snapshots";
import type { SceneRenderer } from "@/lib/render/renderer";
import { createClient } from "@/lib/supabase/client";
import { useProjectStore } from "@/store/useProjectStore";
import { useSceneStore } from "@/store/useSceneStore";
import type { SaveStatus } from "@/hooks/use-autosave";
import { cn } from "@/lib/utils";

interface SimulatorActionsProps {
  className?: string;
  mode: "supabase" | "demo";
  getRenderer: () => SceneRenderer | null;
  saveStatus: SaveStatus;
  savedAt: Date | null;
  onSaveNow: () => void;
}

function statusLabel(status: SaveStatus, savedAt: Date | null): string {
  if (status === "saving") return "저장 중…";
  if (status === "error") return "저장 실패";
  if (status === "saved" && savedAt) {
    return `${String(savedAt.getHours()).padStart(2, "0")}:${String(savedAt.getMinutes()).padStart(2, "0")} 저장됨`;
  }
  return "";
}

/** 헤더 액션 — 초기화 / 실행취소·다시실행 / 저장·공유 / PNG 다운로드 */
export function SimulatorActions({ className, mode, getRenderer, saveStatus, savedAt, onSaveNow }: SimulatorActionsProps) {
  const [busy, setBusy] = useState<"png" | "share" | null>(null);
  const [copied, setCopied] = useState(false);

  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const pastLen = useProjectStore((s) => s.past.length);
  const futureLen = useProjectStore((s) => s.future.length);

  const isDemo = mode === "demo";

  const exportPng = async (): Promise<Blob | null> => {
    const renderer = getRenderer();
    if (!renderer) {
      toast.error("캔버스가 아직 준비되지 않았습니다.");
      return null;
    }
    return renderer.exportPng();
  };

  const onDownload = async () => {
    setBusy("png");
    try {
      const blob = await exportPng();
      if (!blob) return;
      const project = useProjectStore.getState().project;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name ?? "시뮬레이션"}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("이미지를 저장했습니다.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "이미지 내보내기에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const onShare = async () => {
    setBusy("share");
    try {
      const p = useProjectStore.getState();
      const scene = useSceneStore.getState().settings;
      if (!p.project) return;
      const png = await exportPng();
      const state = buildSnapshotState({
        scene,
        surfaces: p.surfaces,
        materials: p.materials,
        tilePlacements: p.tilePlacements,
        objectPlacements: p.objectPlacements,
        estimate: buildEstimate(p.surfaces, p.tilePlacements, p.materials),
      });
      const result = await saveSnapshot(createClient(), {
        projectId: p.project.id,
        title: p.project.name,
        state,
        png,
      });
      await navigator.clipboard.writeText(result.shareUrl).catch(() => undefined);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success("공유 링크를 복사했습니다.", { description: result.shareUrl });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "공유 링크를 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const onReset = () => {
    const s = useProjectStore.getState();
    s.pushHistory();
    s.replaceTilePlacements([]);
    s.setObjectPlacements([]);
    s.selectObject(null);
    useSceneStore.getState().resetAll();
    toast.success("적용한 자재와 조명을 초기화했습니다. (Ctrl+Z 로 되돌릴 수 있습니다)");
  };

  const status = statusLabel(saveStatus, savedAt);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {status && (
        <span className={cn("mr-1 hidden text-[11px] sm:inline", saveStatus === "error" ? "text-destructive" : "text-muted-foreground")}>
          {status}
        </span>
      )}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button size="icon-sm" variant="ghost" onClick={undo} disabled={pastLen === 0} aria-label="실행취소 (Ctrl+Z)">
              <Undo2 className="size-4" />
            </Button>
          }
        />
        <TooltipContent>실행취소 (Ctrl+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button size="icon-sm" variant="ghost" onClick={redo} disabled={futureLen === 0} aria-label="다시실행 (Ctrl+Shift+Z)">
              <Redo2 className="size-4" />
            </Button>
          }
        />
        <TooltipContent>다시실행 (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button size="icon-sm" variant="ghost" onClick={onReset} aria-label="초기화">
              <RotateCcw className="size-4" />
            </Button>
          }
        />
        <TooltipContent>초기화</TooltipContent>
      </Tooltip>

      {!isDemo && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="icon-sm" variant="ghost" onClick={onSaveNow} disabled={saveStatus === "saving"} aria-label="지금 저장">
                {saveStatus === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              </Button>
            }
          />
          <TooltipContent>지금 저장 (변경 시 자동 저장됩니다)</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onShare}
              disabled={isDemo || busy !== null}
              aria-label="공유 링크 복사"
            >
              {busy === "share" ? <Loader2 className="size-4 animate-spin" /> : copied ? <Check className="size-4 text-emerald-500" /> : <Link2 className="size-4" />}
            </Button>
          }
        />
        <TooltipContent>{isDemo ? "공유는 로그인 후 실제 프로젝트에서 가능합니다" : "저장하고 공유 링크 복사"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button size="icon-sm" variant="ghost" onClick={onDownload} disabled={busy !== null} aria-label="PNG 다운로드">
              {busy === "png" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            </Button>
          }
        />
        <TooltipContent>PNG 다운로드 (원본 해상도)</TooltipContent>
      </Tooltip>
    </div>
  );
}
