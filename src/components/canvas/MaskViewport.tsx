"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { canvasToImageData, drawToCanvas, loadImage } from "@/lib/image/loadImage";
import type { RasterLike } from "@/lib/image/palette";
import { flattenPath, polygonCentroid, type Point } from "@/lib/geometry";
import { applyHomography, homographyFromUnitSquare } from "@/lib/render/homography";
import { SURFACE_COLORS, type EditableSurface } from "@/types/surface";
import { cn } from "@/lib/utils";

export type MaskTool = "select" | "polygon" | "wand" | "quad" | "pan";

export interface Selection {
  surfaceId: string;
  kind: "vertex" | "in" | "out" | "quad";
  index: number;
}

export interface MaskViewportHandle {
  fit: () => void;
  zoomBy: (factor: number) => void;
  getScale: () => number;
}

interface MaskViewportProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  surfaces: EditableSurface[];
  activeId: string | null;
  tool: MaskTool;
  selection: Selection | null;
  onRaster: (raster: RasterLike, scale: number) => void;
  onCanvasClick: (point: Point, modifiers: { shiftKey: boolean; altKey: boolean }) => void;
  onCanvasDoubleClick: () => void;
  onSelect: (selection: Selection | null) => void;
  onDragStart: () => void;
  onDragMove: (selection: Selection, point: Point) => void;
  onVertexContextMenu: (selection: Selection) => void;
  onSurfaceHit: (surfaceId: string) => void;
  className?: string;
}

interface View {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 12;

function pathD(surface: EditableSurface): string {
  const v = surface.vertices;
  if (v.length === 0) return "";
  let d = `M ${v[0].x} ${v[0].y}`;
  const segs = surface.closed ? v.length : v.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    if (a.out || b.in) {
      const c1 = a.out ?? [a.x, a.y];
      const c2 = b.in ?? [b.x, b.y];
      d += ` C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${b.x} ${b.y}`;
    } else {
      d += ` L ${b.x} ${b.y}`;
    }
  }
  if (surface.closed) d += " Z";
  return d;
}

/**
 * 마스킹 에디터 뷰포트 — 줌/팬, 이미지, SVG 오버레이(폴리곤·핸들·quad 격자)
 */
export const MaskViewport = forwardRef<MaskViewportHandle, MaskViewportProps>(function MaskViewport(
  {
    imageUrl,
    imageWidth,
    imageHeight,
    surfaces,
    activeId,
    tool,
    selection,
    onRaster,
    onCanvasClick,
    onCanvasDoubleClick,
    onSelect,
    onDragStart,
    onDragMove,
    onVertexContextMenu,
    onSurfaceHit,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  const drag = useRef<
    | { type: "pan"; startX: number; startY: number; tx: number; ty: number; pointerId: number }
    | { type: "handle"; selection: Selection; pointerId: number }
    | { type: "click"; startX: number; startY: number; pointerId: number }
    | null
  >(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; cx: number; cy: number; tx: number; ty: number } | null>(null);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el || imageWidth === 0) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min(cw / imageWidth, ch / imageHeight) * 0.96;
    setView({ scale, tx: (cw - imageWidth * scale) / 2, ty: (ch - imageHeight * scale) / 2 });
  }, [imageWidth, imageHeight]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fit,
      zoomBy: (factor) => {
        const el = containerRef.current;
        if (!el) return;
        zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
      },
      getScale: () => viewRef.current.scale,
    }),
    [fit, zoomAt],
  );

  // 이미지 로드 → 다운스케일 래스터 (매직완드용) + fit
  useEffect(() => {
    let cancelled = false;
    setImageReady(false);
    loadImage(imageUrl)
      .then((img) => {
        if (cancelled) return;
        const canvas = drawToCanvas(img, 1024);
        const raster = canvasToImageData(canvas);
        onRaster(raster, img.naturalWidth / canvas.width);
        setImageReady(true);
        fit();
      })
      .catch(() => {
        /* 이미지 로드 실패: 오버레이만 표시 */
        if (!cancelled) setImageReady(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setSpaceHeld(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const toImagePoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = innerRef.current?.getBoundingClientRect();
    const s = viewRef.current.scale;
    if (!rect) return [0, 0];
    return [(clientX - rect.left) / s, (clientY - rect.top) / s];
  }, []);

  const toLocal = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const { x, y } = toLocal(e.clientX, e.clientY);
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomAt(factor, x, y);
  };

  const startHandleDrag = (e: ReactPointerEvent, sel: Selection) => {
    // 도구별로 핸들이 클릭을 가로채도 되는지 결정 — 아니면 캔버스 클릭으로 흘려보낸다
    if (tool === "pan" || tool === "wand" || spaceHeld) return;
    if (tool === "quad" && sel.kind !== "quad") return;
    if (tool === "polygon") {
      const sf = surfaces.find((x) => x.id === sel.surfaceId);
      // 열린 폴리곤의 첫 점 클릭은 "닫기" 이므로 캔버스로 넘긴다
      if (sf && !sf.closed && sel.kind === "vertex" && sel.index === 0) return;
    }
    e.stopPropagation();
    e.preventDefault();
    containerRef.current?.setPointerCapture(e.pointerId);
    onSelect(sel);
    onDragStart();
    drag.current = { type: "handle", selection: sel, pointerId: e.pointerId };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const { x: ax, y: ay } = toLocal(a.x, a.y);
      const { x: bx, y: by } = toLocal(b.x, b.y);
      pinch.current = {
        dist: Math.hypot(ax - bx, ay - by),
        scale: viewRef.current.scale,
        cx: (ax + bx) / 2,
        cy: (ay + by) / 2,
        tx: viewRef.current.tx,
        ty: viewRef.current.ty,
      };
      drag.current = null;
      return;
    }
    const isPan = e.button === 1 || tool === "pan" || spaceHeld;
    containerRef.current?.setPointerCapture(e.pointerId);
    if (isPan) {
      const v = viewRef.current;
      drag.current = { type: "pan", startX: e.clientX, startY: e.clientY, tx: v.tx, ty: v.ty, pointerId: e.pointerId };
      return;
    }
    if (e.button !== 0) return;
    drag.current = { type: "click", startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const { x: ax, y: ay } = toLocal(a.x, a.y);
      const { x: bx, y: by } = toLocal(b.x, b.y);
      const dist = Math.hypot(ax - bx, ay - by);
      const p = pinch.current;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (p.scale * dist) / Math.max(1, p.dist)));
      const k = scale / p.scale;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      setView({ scale, tx: mx - (p.cx - p.tx) * k, ty: my - (p.cy - p.ty) * k });
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.type === "pan") {
      setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.startX), ty: d.ty + (e.clientY - d.startY) }));
    } else if (d.type === "handle") {
      onDragMove(d.selection, toImagePoint(e.clientX, e.clientY));
    }
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    if (d && d.pointerId === e.pointerId) {
      if (d.type === "click" && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) {
        onCanvasClick(toImagePoint(e.clientX, e.clientY), { shiftKey: e.shiftKey, altKey: e.altKey });
      }
      drag.current = null;
    }
  };

  const s = view.scale;
  const handleR = 5 / s;
  const strokeW = 1.5 / s;
  const active = surfaces.find((x) => x.id === activeId) ?? null;

  const quadGrid = useMemo(() => {
    if (!active?.quad || active.quad.length !== 4) return null;
    try {
      const H = homographyFromUnitSquare(active.quad);
      const lines: [Point, Point][] = [];
      const N = 6;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        lines.push([applyHomography(H, [t, 0]), applyHomography(H, [t, 1])]);
        lines.push([applyHomography(H, [0, t]), applyHomography(H, [1, t])]);
      }
      return lines;
    } catch {
      return null;
    }
  }, [active?.quad]);

  const cursor =
    tool === "pan" || spaceHeld
      ? "grab"
      : tool === "polygon" || tool === "quad" || tool === "wand"
        ? "crosshair"
        : "default";

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full touch-none overflow-hidden bg-neutral-900 select-none", className)}
      style={{ cursor }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={onCanvasDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={innerRef}
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: imageWidth, height: imageHeight, transform: `translate(${view.tx}px, ${view.ty}px) scale(${s})` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          width={imageWidth}
          height={imageHeight}
          draggable={false}
          crossOrigin="anonymous"
          className="pointer-events-none block"
          style={{ width: imageWidth, height: imageHeight, opacity: imageReady ? 1 : 0.4 }}
        />
        <svg
          className="absolute top-0 left-0 overflow-visible"
          width={imageWidth}
          height={imageHeight}
          viewBox={`0 0 ${imageWidth} ${imageHeight}`}
        >
          {/* 비활성 표면 */}
          {surfaces
            .filter((sf) => sf.id !== activeId && sf.vertices.length > 0)
            .map((sf) => {
              const color = SURFACE_COLORS[sf.surface_type];
              const flat = flattenPath(sf.vertices, sf.closed);
              const c = flat.length >= 3 ? polygonCentroid(flat) : [sf.vertices[0].x, sf.vertices[0].y];
              return (
                <g key={sf.id}>
                  <path
                    d={pathD(sf)}
                    fill={color}
                    fillOpacity={0.18}
                    stroke={color}
                    strokeWidth={strokeW}
                    style={{ pointerEvents: tool === "select" ? "auto" : "none", cursor: "pointer" }}
                    onPointerDown={(e) => {
                      if (tool === "select" && !spaceHeld) {
                        e.stopPropagation();
                        onSurfaceHit(sf.id);
                      }
                    }}
                  />
                  <text x={c[0]} y={c[1]} fontSize={14 / s} fill="#fff" stroke="#000" strokeWidth={3 / s} paintOrder="stroke" textAnchor="middle" style={{ pointerEvents: "none" }}>
                    {sf.label}
                  </text>
                </g>
              );
            })}

          {/* 활성 표면 */}
          {active && active.vertices.length > 0 && (
            <g>
              <path
                d={pathD(active)}
                fill={SURFACE_COLORS[active.surface_type]}
                fillOpacity={active.closed ? 0.3 : 0.12}
                stroke={SURFACE_COLORS[active.surface_type]}
                strokeWidth={strokeW * 1.5}
                style={{ pointerEvents: "none" }}
              />
              {active.vertices.map((v, i) => {
                const selected = selection?.surfaceId === active.id && selection.kind === "vertex" && selection.index === i;
                const isFirstOpen = i === 0 && !active.closed && active.vertices.length >= 3;
                return (
                  <g key={i}>
                    {v.in && (
                      <>
                        <line x1={v.x} y1={v.y} x2={v.in[0]} y2={v.in[1]} stroke="#fff" strokeWidth={strokeW} strokeOpacity={0.8} />
                        <circle
                          cx={v.in[0]}
                          cy={v.in[1]}
                          r={handleR * 0.8}
                          fill="#fbbf24"
                          stroke="#000"
                          strokeWidth={strokeW}
                          style={{ cursor: "move" }}
                          onPointerDown={(e) => startHandleDrag(e, { surfaceId: active.id, kind: "in", index: i })}
                        />
                      </>
                    )}
                    {v.out && (
                      <>
                        <line x1={v.x} y1={v.y} x2={v.out[0]} y2={v.out[1]} stroke="#fff" strokeWidth={strokeW} strokeOpacity={0.8} />
                        <circle
                          cx={v.out[0]}
                          cy={v.out[1]}
                          r={handleR * 0.8}
                          fill="#fbbf24"
                          stroke="#000"
                          strokeWidth={strokeW}
                          style={{ cursor: "move" }}
                          onPointerDown={(e) => startHandleDrag(e, { surfaceId: active.id, kind: "out", index: i })}
                        />
                      </>
                    )}
                    <circle
                      cx={v.x}
                      cy={v.y}
                      r={isFirstOpen ? handleR * 1.6 : handleR}
                      fill={selected ? "#fff" : isFirstOpen ? "#22c55e" : SURFACE_COLORS[active.surface_type]}
                      stroke="#fff"
                      strokeWidth={strokeW}
                      style={{ cursor: "move" }}
                      onPointerDown={(e) => startHandleDrag(e, { surfaceId: active.id, kind: "vertex", index: i })}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onVertexContextMenu({ surfaceId: active.id, kind: "vertex", index: i });
                      }}
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* quad */}
          {active?.quad && active.quad.length > 0 && (
            <g>
              {quadGrid?.map(([a, b], i) => (
                <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#fff" strokeWidth={strokeW * 0.8} strokeOpacity={0.55} />
              ))}
              {active.quad.length >= 2 && (
                <polyline
                  points={active.quad.map((p) => p.join(",")).join(" ")}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={strokeW * 1.4}
                  strokeDasharray={`${6 / s} ${4 / s}`}
                />
              )}
              {active.quad.length === 4 && (
                <line x1={active.quad[3][0]} y1={active.quad[3][1]} x2={active.quad[0][0]} y2={active.quad[0][1]} stroke="#fff" strokeWidth={strokeW * 1.4} strokeDasharray={`${6 / s} ${4 / s}`} />
              )}
              {active.quad.map((p, i) => {
                const selected = selection?.surfaceId === active.id && selection.kind === "quad" && selection.index === i;
                return (
                  <g key={i}>
                    <rect
                      x={p[0] - handleR * 1.3}
                      y={p[1] - handleR * 1.3}
                      width={handleR * 2.6}
                      height={handleR * 2.6}
                      fill={selected ? "#fff" : "#111"}
                      stroke="#fff"
                      strokeWidth={strokeW}
                      style={{ cursor: "move" }}
                      onPointerDown={(e) => startHandleDrag(e, { surfaceId: active.id, kind: "quad", index: i })}
                    />
                    <text x={p[0]} y={p[1] - handleR * 2} fontSize={12 / s} fill="#fff" stroke="#000" strokeWidth={3 / s} paintOrder="stroke" textAnchor="middle" style={{ pointerEvents: "none" }}>
                      {["좌상", "우상", "우하", "좌하"][i]}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
});
