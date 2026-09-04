"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { SceneRenderer, CameraState } from "@/lib/render/renderer";
import { effectiveTilePlacements, useProjectStore } from "@/store/useProjectStore";
import { useViewerStore } from "@/store/useViewerStore";
import { cn } from "@/lib/utils";

interface SimulatorCanvasProps {
  className?: string;
  onRendererReady?: (renderer: SceneRenderer) => void;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

/**
 * 시뮬레이터 캔버스 — 렌더러 생성, 스토어 → 렌더러 동기화, 줌/팬.
 */
export function SimulatorCanvas({ className, onRendererReady }: SimulatorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const cameraRef = useRef<CameraState>({ scale: 1, x: 0, y: 0 });
  const userMoved = useRef(false);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameMs, setFrameMs] = useState<number | null>(null);

  // 렌더러 생성 — 캔버스는 마운트마다 새로 만든다.
  // (Pixi app.destroy() 가 WebGL 컨텍스트를 잃게 만들므로, React strict mode 의 재마운트에서
  //  같은 <canvas> 를 재사용하면 컨텍스트가 이미 lost 상태가 된다.)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = document.createElement("canvas");
    canvas.className = "block size-full";
    container.prepend(canvas);
    canvasRef.current = canvas;
    let disposed = false;
    let renderer: SceneRenderer | null = null;
    // pixi.js 는 브라우저 전용이므로 SSR 을 피해 동적으로 불러온다
    import("@/lib/render/renderer")
      .then(({ SceneRenderer }) => SceneRenderer.create(canvas, container.clientWidth, container.clientHeight))
      .then((r) => {
        if (disposed) {
          r.destroy();
          return;
        }
        renderer = r;
        rendererRef.current = r;
        r.onRendered = (ms) => setFrameMs(ms);
        setReady(true);
        onRendererReady?.(r);
      })
      .catch((err) => {
        console.error(err);
        setError(err instanceof Error ? err.message : "WebGL 초기화 실패");
      });
    return () => {
      disposed = true;
      renderer?.destroy();
      rendererRef.current = null;
      canvas.remove();
      canvasRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 스토어 → 렌더러
  useEffect(() => {
    if (!ready) return;
    const renderer = rendererRef.current!;
    const container = containerRef.current!;

    const applyProject = async (project: ReturnType<typeof useProjectStore.getState>["project"]) => {
      if (!project) return;
      await renderer.setBaseImage(project.imageUrl, project.width_px, project.height_px);
      if (!userMoved.current) cameraRef.current = renderer.fitCamera(container.clientWidth, container.clientHeight);
      const s = useProjectStore.getState();
      renderer.setSurfaces(s.surfaces);
      renderer.setTilePlacements(effectiveTilePlacements(s), s.materials);
      void renderer.setActualImage(project.afterImageUrl ?? null).catch((err) => console.warn(err));
    };

    // Before/After 모드 동기화
    const applyViewer = (v: ReturnType<typeof useViewerStore.getState>) => {
      const wasSplit = renderer.getViewMode() === "split";
      renderer.setViewMode(v.mode);
      renderer.setSliderFraction(v.sliderX);
      renderer.setHoldBefore(v.holdBefore);
      if (wasSplit !== (v.mode === "split") && !userMoved.current) {
        cameraRef.current = renderer.fitCamera(container.clientWidth, container.clientHeight);
      }
    };
    applyViewer(useViewerStore.getState());
    const unsubscribeViewer = useViewerStore.subscribe((v) => applyViewer(v));

    const state = useProjectStore.getState();
    void applyProject(state.project);

    const unsubscribe = useProjectStore.subscribe((s, prev) => {
      if (s.project !== prev.project) {
        void applyProject(s.project);
        return;
      }
      if (s.surfaces !== prev.surfaces) renderer.setSurfaces(s.surfaces);
      if (
        s.surfaces !== prev.surfaces ||
        s.tilePlacements !== prev.tilePlacements ||
        s.hoverMaterialId !== prev.hoverMaterialId ||
        s.selectedSurfaceId !== prev.selectedSurfaceId ||
        s.materials !== prev.materials
      ) {
        renderer.setTilePlacements(effectiveTilePlacements(s), s.materials);
      }
    });
    return () => {
      unsubscribe();
      unsubscribeViewer();
    };
  }, [ready]);

  // 리사이즈
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const r = rendererRef.current;
      if (!r) return;
      r.resize(container.clientWidth, container.clientHeight);
      if (!userMoved.current) cameraRef.current = r.fitCamera(container.clientWidth, container.clientHeight);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const setCamera = (cam: CameraState) => {
    cameraRef.current = cam;
    rendererRef.current?.setCamera(cam);
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    let cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // 분할 모드에서 오른쪽 절반은 자체 원점을 가진다
    if (useViewerStore.getState().mode === "split" && cx >= rect.width / 2) cx -= rect.width / 2;
    const cam = cameraRef.current;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * Math.exp(-e.deltaY * 0.0015)));
    const k = scale / cam.scale;
    userMoved.current = true;
    setCamera({ scale, x: cx - (cx - cam.x) * k, y: cy - (cy - cam.y) * k });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    containerRef.current?.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: cameraRef.current.x, cy: cameraRef.current.y };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    userMoved.current = true;
    setCamera({ ...cameraRef.current, x: d.cx + (e.clientX - d.x), y: d.cy + (e.clientY - d.y) });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onDoubleClick = () => {
    userMoved.current = false;
    const c = containerRef.current!;
    cameraRef.current = rendererRef.current?.fitCamera(c.clientWidth, c.clientHeight) ?? cameraRef.current;
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full touch-none overflow-hidden bg-neutral-900 select-none", className)}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      style={{ cursor: drag.current ? "grabbing" : "grab" }}
    >
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
          WebGL 을 초기화하지 못했습니다: {error}
        </div>
      )}
      {frameMs !== null && (
        <div className="pointer-events-none absolute right-2 bottom-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white/80">
          {frameMs.toFixed(1)} ms
        </div>
      )}
    </div>
  );
}
