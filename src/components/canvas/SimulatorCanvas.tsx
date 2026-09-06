"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { SceneRenderer, CameraState } from "@/lib/render/renderer";
import type { Point } from "@/lib/geometry";
import { effectiveTilePlacements, useProjectStore } from "@/store/useProjectStore";
import { useSceneStore } from "@/store/useSceneStore";
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
  /** 위생도기 드래그 중인 대상 (팬 대신 오브젝트를 옮긴다). dx/dy 는 잡은 지점과 접지점의 차 */
  const objectDrag = useRef<{ id: string; pointerId: number; dx: number; dy: number } | null>(null);
  /** 핀치 줌 상태 — 활성 포인터 2개일 때만 */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number; scale: number } | null>(null);
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
      renderer.setObjectPlacements(s.objectPlacements, s.materials);
      renderer.setSelectedObject(s.selectedObjectId);
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

    // 조명·채도 동기화
    const applyScene = (sc: ReturnType<typeof useSceneStore.getState>) => {
      renderer.setSceneSettings(sc.settings);
      renderer.setGradeEnabled(!sc.compareOriginal);
      renderer.setShadingStrength(sc.shadingStrength);
    };
    applyScene(useSceneStore.getState());
    const unsubscribeScene = useSceneStore.subscribe((sc, prev) => {
      if (sc.settings !== prev.settings || sc.compareOriginal !== prev.compareOriginal || sc.shadingStrength !== prev.shadingStrength) applyScene(sc);
    });

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
      // 표면이 바뀌면 바닥 호모그래피가 바뀌므로 도기 크기도 다시 계산해야 한다
      if (s.objectPlacements !== prev.objectPlacements || s.materials !== prev.materials || s.surfaces !== prev.surfaces) {
        renderer.setObjectPlacements(s.objectPlacements, s.materials);
      }
      if (s.selectedObjectId !== prev.selectedObjectId) renderer.setSelectedObject(s.selectedObjectId);
    });
    return () => {
      unsubscribe();
      unsubscribeViewer();
      unsubscribeScene();
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

  /** 화면 좌표 → 원본 이미지 픽셀 좌표 */
  const toImagePoint = (clientX: number, clientY: number): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    let cx = clientX - rect.left;
    const cy = clientY - rect.top;
    if (useViewerStore.getState().mode === "split" && cx >= rect.width / 2) cx -= rect.width / 2;
    const cam = cameraRef.current;
    return [(cx - cam.x) / cam.scale, (cy - cam.y) / cam.scale];
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    containerRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 두 손가락이면 핀치 줌으로 전환 (팬·오브젝트 드래그 취소)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        scale: cameraRef.current.scale,
      };
      drag.current = null;
      objectDrag.current = null;
      return;
    }
    if (pointers.current.size > 2) return;

    // 도기를 눌렀으면 팬 대신 그 도기를 옮긴다
    const grab = toImagePoint(e.clientX, e.clientY);
    const hit = rendererRef.current?.hitTestObject(grab) ?? null;
    const store = useProjectStore.getState();
    if (hit) {
      if (store.selectedObjectId !== hit) store.selectObject(hit);
      store.pushHistory(); // 드래그 전 상태를 한 번만 기록
      // 잡은 지점과 접지점의 차를 유지해야 도기가 커서로 순간이동하지 않는다
      const p = store.objectPlacements.find((o) => o.id === hit);
      const project = store.project;
      const dx = p && project ? p.pos_x * project.width_px - grab[0] : 0;
      const dy = p && project ? p.pos_y * project.height_px - grab[1] : 0;
      objectDrag.current = { id: hit, pointerId: e.pointerId, dx, dy };
      return;
    }
    if (store.selectedObjectId) store.selectObject(null);
    drag.current = { x: e.clientX, y: e.clientY, cx: cameraRef.current.x, cy: cameraRef.current.y };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const p = pinch.current;
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const rect = containerRef.current!.getBoundingClientRect();
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (p.scale * dist) / p.dist));
      const cam = cameraRef.current;
      const k = scale / cam.scale;
      const cx = p.cx - rect.left;
      const cy = p.cy - rect.top;
      userMoved.current = true;
      setCamera({ scale, x: cx - (cx - cam.x) * k, y: cy - (cy - cam.y) * k });
      return;
    }

    const od = objectDrag.current;
    if (od && od.pointerId === e.pointerId) {
      const project = useProjectStore.getState().project;
      if (!project) return;
      const [ix, iy] = toImagePoint(e.clientX, e.clientY);
      // 드래그 중에는 히스토리를 쌓지 않는다 (pointerdown 에서 한 번만 기록)
      useProjectStore.getState().updateObjectPlacement(
        od.id,
        { pos_x: clamp01((ix + od.dx) / project.width_px), pos_y: clamp01((iy + od.dy) / project.height_px) },
        { history: false },
      );
      return;
    }

    const d = drag.current;
    if (!d) return;
    userMoved.current = true;
    setCamera({ ...cameraRef.current, x: d.cx + (e.clientX - d.x), y: d.cy + (e.clientY - d.y) });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (objectDrag.current?.pointerId === e.pointerId) objectDrag.current = null;
    drag.current = null;
  };

  const onDoubleClick = () => {
    userMoved.current = false;
    const c = containerRef.current!;
    cameraRef.current = rendererRef.current?.fitCamera(c.clientWidth, c.clientHeight) ?? cameraRef.current;
  };

  const cursor = objectDrag.current ? "grabbing" : drag.current ? "grabbing" : "grab";

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
      style={{ cursor }}
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

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
