"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Hand,
  Loader2,
  Maximize2,
  MousePointer2,
  PenTool,
  Redo2,
  Save,
  Square,
  Undo2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { MaskViewport, type MaskTool, type MaskViewportHandle, type Selection } from "@/components/canvas/MaskViewport";
import { SurfacePanel } from "@/components/canvas/SurfacePanel";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { distance, flattenPath, pointInPolygon, type Point } from "@/lib/geometry";
import type { RasterLike } from "@/lib/image/palette";
import { maskToPolygon } from "@/lib/mask/contour";
import { floodFill, smoothMask } from "@/lib/mask/floodFill";
import { saveSurfaces, surfaceToRow } from "@/lib/projects/surfaces";
import { updateLocalProject } from "@/lib/projects/localStore";
import { uploadShadingMaps } from "@/lib/render/shadingExport";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_LABELS, type EditableSurface, type SurfaceType } from "@/types/surface";

interface MaskEditorProps {
  projectId: string;
  projectName: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  initialSurfaces: EditableSurface[];
  mode: "supabase" | "demo" | "local";
}

const MAX_HISTORY = 50;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * 표면 마스킹 에디터: 폴리곤(베지어) · 매직완드 · 원근 4점 · 라벨/치수 → surfaces 저장
 */
export function MaskEditor({ projectId, projectName, imageUrl, imageWidth, imageHeight, initialSurfaces, mode }: MaskEditorProps) {
  const [surfaces, setSurfaces] = useState<EditableSurface[]>(initialSurfaces);
  const [activeId, setActiveId] = useState<string | null>(initialSurfaces[0]?.id ?? null);
  const [tool, setTool] = useState<MaskTool>(initialSurfaces.length === 0 ? "polygon" : "select");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tolerance, setTolerance] = useState(12);
  const [edgeSensitivity, setEdgeSensitivity] = useState(10);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const past = useRef<EditableSurface[][]>([]);
  const future = useRef<EditableSurface[][]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const raster = useRef<{ data: RasterLike; scale: number } | null>(null);
  const viewportRef = useRef<MaskViewportHandle>(null);
  const surfacesRef = useRef(surfaces);
  surfacesRef.current = surfaces;

  const active = useMemo(() => surfaces.find((s) => s.id === activeId) ?? null, [surfaces, activeId]);

  // ----- 히스토리 -----
  const snapshot = useCallback(() => {
    past.current.push(structuredClone(surfacesRef.current));
    if (past.current.length > MAX_HISTORY) past.current.shift();
    future.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const commit = useCallback(
    (updater: (prev: EditableSurface[]) => EditableSurface[]) => {
      snapshot();
      setSurfaces((prev) => updater(prev));
      setDirty(true);
    },
    [snapshot],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(structuredClone(surfacesRef.current));
    setSurfaces(prev);
    setSelection(null);
    setDirty(true);
    setHistoryTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(structuredClone(surfacesRef.current));
    setSurfaces(next);
    setSelection(null);
    setDirty(true);
    setHistoryTick((t) => t + 1);
  }, []);

  // ----- 표면 조작 -----
  const updateSurface = useCallback((id: string, patch: Partial<EditableSurface> | ((s: EditableSurface) => Partial<EditableSurface>)) => {
    setSurfaces((prev) => prev.map((s) => (s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)));
    setDirty(true);
  }, []);

  const addSurface = (type: SurfaceType) => {
    const used = new Set(surfacesRef.current.map((s) => s.label));
    const label = DEFAULT_LABELS[type].find((l) => !used.has(l)) ?? `${DEFAULT_LABELS[type][0]} ${surfacesRef.current.length + 1}`;
    const id = newId();
    commit((prev) => [
      ...prev,
      {
        id,
        label,
        surface_type: type,
        vertices: [],
        closed: false,
        quad: null,
        real_width_mm: null,
        real_height_mm: null,
        z_order: prev.length,
        source: "polygon",
        isNew: true,
      },
    ]);
    setActiveId(id);
    setSelection(null);
    setTool("polygon");
  };

  const removeSurface = (id: string) => {
    const target = surfacesRef.current.find((s) => s.id === id);
    commit((prev) => prev.filter((s) => s.id !== id));
    if (target && !target.isNew) setDeletedIds((d) => [...d, id]);
    if (activeId === id) setActiveId(null);
    setSelection(null);
  };

  const moveZ = (id: string, dir: -1 | 1) => {
    commit((prev) => {
      const sorted = [...prev].sort((a, b) => a.z_order - b.z_order);
      const idx = sorted.findIndex((s) => s.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= sorted.length) return prev;
      [sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]];
      return sorted.map((s, i) => ({ ...s, z_order: i }));
    });
  };

  const closePolygon = useCallback(
    (id: string) => {
      const s = surfacesRef.current.find((x) => x.id === id);
      if (!s || s.closed || s.vertices.length < 3) return;
      commit((prev) => prev.map((x) => (x.id === id ? { ...x, closed: true } : x)));
      setTool("select");
    },
    [commit],
  );

  const runWand = useCallback(
    (point: Point) => {
      if (!raster.current) {
        toast.error("이미지가 아직 준비되지 않았습니다.");
        return;
      }
      if (!activeId) {
        toast.error("먼저 표면을 추가하거나 선택하세요.");
        return;
      }
      const { data, scale } = raster.current;
      const res = floodFill(data, point[0] / scale, point[1] / scale, { tolerance, edgeThreshold: edgeSensitivity });
      if (res.count === 0) return;
      const smooth = smoothMask(res.mask, res.width, res.height, 1);
      const poly = maskToPolygon(smooth, res.width, res.height, { epsilon: 2, scale });
      if (!poly || poly.length < 3) {
        toast.error("영역을 폴리곤으로 만들지 못했습니다. 허용오차를 조절해 보세요.");
        return;
      }
      commit((prev) =>
        prev.map((s) =>
          s.id === activeId
            ? { ...s, vertices: poly.map(([x, y]) => ({ x, y })), closed: true, source: "wand" }
            : s,
        ),
      );
      setSelection(null);
      toast.success(`${poly.length}개 꼭짓점으로 영역을 만들었습니다. 선택 도구로 다듬을 수 있습니다.`);
    },
    [activeId, commit, tolerance, edgeSensitivity],
  );

  const onCanvasClick = useCallback(
    (point: Point) => {
      if (tool === "polygon") {
        if (!activeId) {
          toast.error("먼저 바닥/벽을 추가하세요.");
          return;
        }
        const s = surfacesRef.current.find((x) => x.id === activeId);
        if (!s) return;
        if (s.closed) {
          // 닫힌 폴리곤 위 클릭은 무시 (선택 도구로 편집)
          return;
        }
        const first = s.vertices[0];
        const closeRadius = 10 / (viewportRef.current?.getScale() ?? 1);
        if (first && s.vertices.length >= 3 && distance(point, [first.x, first.y]) <= closeRadius) {
          closePolygon(activeId);
          return;
        }
        commit((prev) => prev.map((x) => (x.id === activeId ? { ...x, vertices: [...x.vertices, { x: point[0], y: point[1] }] } : x)));
        setSelection({ surfaceId: activeId, kind: "vertex", index: s.vertices.length });
      } else if (tool === "wand") {
        runWand(point);
      } else if (tool === "quad") {
        if (!activeId) {
          toast.error("먼저 표면을 선택하세요.");
          return;
        }
        const s = surfacesRef.current.find((x) => x.id === activeId);
        if (!s) return;
        const quad = s.quad ?? [];
        if (quad.length >= 4) return;
        commit((prev) => prev.map((x) => (x.id === activeId ? { ...x, quad: [...quad, point] } : x)));
        if (quad.length + 1 === 4) {
          toast.success("원근 4점을 지정했습니다. 격자가 표면과 나란한지 확인하세요.");
          setTool("select");
        }
      } else if (tool === "select") {
        // 폴리곤 내부 클릭 → 해당 표면 활성화 (뒤에서 처리), 빈 곳 → 선택 해제
        const hit = [...surfacesRef.current]
          .sort((a, b) => b.z_order - a.z_order)
          .find((s) => s.closed && pointInPolygon(point, flattenPath(s.vertices, true)));
        if (hit) setActiveId(hit.id);
        setSelection(null);
      }
    },
    [tool, activeId, commit, closePolygon, runWand],
  );

  const onDragMove = useCallback(
    (sel: Selection, point: Point) => {
      updateSurface(sel.surfaceId, (s) => {
        if (sel.kind === "quad") {
          const quad = s.quad ? [...s.quad] : [];
          quad[sel.index] = point;
          return { quad };
        }
        const vertices = s.vertices.map((v, i) => {
          if (i !== sel.index) return v;
          if (sel.kind === "vertex") {
            const dx = point[0] - v.x;
            const dy = point[1] - v.y;
            return {
              ...v,
              x: point[0],
              y: point[1],
              in: v.in ? ([v.in[0] + dx, v.in[1] + dy] as Point) : undefined,
              out: v.out ? ([v.out[0] + dx, v.out[1] + dy] as Point) : undefined,
            };
          }
          return sel.kind === "in" ? { ...v, in: point } : { ...v, out: point };
        });
        return { vertices };
      });
    },
    [updateSurface],
  );

  const deleteSelectedVertex = useCallback(
    (sel: Selection | null) => {
      if (!sel || sel.kind === "quad") return;
      commit((prev) =>
        prev.map((s) => {
          if (s.id !== sel.surfaceId) return s;
          if (sel.kind !== "vertex") {
            return { ...s, vertices: s.vertices.map((v, i) => (i === sel.index ? { ...v, [sel.kind]: undefined } : v)) };
          }
          const vertices = s.vertices.filter((_, i) => i !== sel.index);
          return { ...s, vertices, closed: s.closed && vertices.length >= 3 };
        }),
      );
      setSelection(null);
    },
    [commit],
  );

  const toggleCurve = useCallback(() => {
    if (!selection || selection.kind !== "vertex") return;
    commit((prev) =>
      prev.map((s) => {
        if (s.id !== selection.surfaceId) return s;
        const n = s.vertices.length;
        const i = selection.index;
        const v = s.vertices[i];
        if (v.in || v.out) {
          return { ...s, vertices: s.vertices.map((x, j) => (j === i ? { x: x.x, y: x.y } : x)) };
        }
        const prevV = s.vertices[(i - 1 + n) % n];
        const nextV = s.vertices[(i + 1) % n];
        const inH: Point = [v.x + (prevV.x - v.x) / 3, v.y + (prevV.y - v.y) / 3];
        const outH: Point = [v.x + (nextV.x - v.x) / 3, v.y + (nextV.y - v.y) / 3];
        return { ...s, vertices: s.vertices.map((x, j) => (j === i ? { ...x, in: inH, out: outH } : x)) };
      }),
    );
  }, [commit, selection]);

  // ----- 저장 -----
  const save = async () => {
    const invalid = surfaces.filter((s) => flattenPath(s.vertices, true).length < 3);
    if (invalid.length > 0) {
      toast.warning(`${invalid.map((s) => s.label).join(", ")} 은(는) 꼭짓점이 3개 미만이라 저장에서 제외됩니다.`);
    }
    if (mode === "demo") {
      console.log("[demo] surfaces", surfaces);
      toast.success("데모 모드: 콘솔에 표면 데이터를 출력했습니다.");
      setDirty(false);
      return;
    }
    if (mode === "local") {
      // Supabase 없이 이 브라우저에 저장. shading map 은 저장하지 않고
      // 렌더러가 매번 원본 사진에서 즉석 계산한다(≈30ms)
      setSaving(true);
      try {
        const rows = surfaces
          .map((sf) => surfaceToRow(projectId, sf))
          .filter((r): r is NonNullable<typeof r> => r !== null);
        await updateLocalProject(projectId, { surfaces: rows });
        setDeletedIds([]);
        setSurfaces((prev) => prev.map((sf) => ({ ...sf, isNew: false })));
        setDirty(false);
        toast.success(`표면 ${rows.length}개를 이 브라우저에 저장했습니다.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      // shading map(조명 맵) PNG 캐시 — 실패해도 렌더러가 즉석 계산하므로 저장은 계속한다
      let shadingUrls: Record<string, string | null> = {};
      if (raster.current) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const valid = surfaces.filter((s) => flattenPath(s.vertices, true).length >= 3);
          shadingUrls = await uploadShadingMaps(valid, {
            userId: user.id,
            projectId,
            raster: raster.current.data,
            rasterScale: 1 / raster.current.scale,
          });
        }
      }
      const result = await saveSurfaces(supabase, projectId, surfaces, deletedIds, shadingUrls);
      setDeletedIds([]);
      setSurfaces((prev) => prev.map((s) => ({ ...s, isNew: false })));
      setDirty(false);
      toast.success(`표면 ${result.saved}개를 저장했습니다.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  // ----- 단축키 -----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      switch (e.key) {
        case "v":
        case "V":
          setTool("select");
          break;
        case "p":
        case "P":
          setTool("polygon");
          break;
        case "w":
        case "W":
          setTool("wand");
          break;
        case "q":
        case "Q":
          setTool("quad");
          break;
        case "h":
        case "H":
          setTool("pan");
          break;
        case "c":
        case "C":
          toggleCurve();
          break;
        case "0":
          viewportRef.current?.fit();
          break;
        case "+":
        case "=":
          viewportRef.current?.zoomBy(1.25);
          break;
        case "-":
          viewportRef.current?.zoomBy(0.8);
          break;
        case "Enter":
          if (activeId) closePolygon(activeId);
          break;
        case "Escape":
          if (activeId && tool === "polygon") closePolygon(activeId);
          setSelection(null);
          break;
        case "Delete":
        case "Backspace":
          deleteSelectedVertex(selection);
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, toggleCurve, deleteSelectedVertex, selection, activeId, tool, closePolygon]);

  // 페이지 이탈 경고
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;
  void historyTick;

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Link href={mode === "demo" ? "/" : `/projects/${projectId}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">프로젝트</span>
        </Link>
        <span className="truncate text-sm font-medium">{projectName} · 표면 마스킹</span>

        <ToggleGroup
          value={[tool]}
          onValueChange={(v) => {
            const next = (v as MaskTool[])[0];
            if (next) setTool(next);
          }}
          variant="outline"
          size="sm"
          spacing={0}
          className="ml-2"
          aria-label="도구"
        >
          <ToolItem value="select" label="선택 (V)">
            <MousePointer2 className="size-4" />
          </ToolItem>
          <ToolItem value="polygon" label="폴리곤 (P)">
            <PenTool className="size-4" />
          </ToolItem>
          <ToolItem value="wand" label="매직완드 (W)">
            <Wand2 className="size-4" />
          </ToolItem>
          <ToolItem value="quad" label="원근 4점 (Q)">
            <Square className="size-4" />
          </ToolItem>
          <ToolItem value="pan" label="이동 (H)">
            <Hand className="size-4" />
          </ToolItem>
        </ToggleGroup>

        {tool === "wand" && (
          <>
            <div className="flex w-44 items-center gap-2 text-xs">
              <span className="whitespace-nowrap text-muted-foreground">허용오차 {tolerance}</span>
              <Slider min={1} max={80} value={tolerance} onValueChange={(v) => setTolerance(Array.isArray(v) ? v[0] : v)} aria-label="매직완드 허용오차" />
            </div>
            <div className="hidden w-44 items-center gap-2 text-xs lg:flex" title="0 이면 끔. 벽과 벽이 만나는 모서리처럼 밝기가 꺾이는 곳에서 선택을 멈춥니다.">
              <span className="whitespace-nowrap text-muted-foreground">경계 감도 {edgeSensitivity}</span>
              <Slider min={0} max={40} value={edgeSensitivity} onValueChange={(v) => setEdgeSensitivity(Array.isArray(v) ? v[0] : v)} aria-label="경계 감도" />
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" title="실행취소 (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" title="재실행 (Ctrl+Y)" onClick={redo} disabled={!canRedo}>
            <Redo2 className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" title="축소" onClick={() => viewportRef.current?.zoomBy(0.8)}>
            <ZoomOut className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" title="확대" onClick={() => viewportRef.current?.zoomBy(1.25)}>
            <ZoomIn className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" title="화면 맞춤 (0)" onClick={() => viewportRef.current?.fit()}>
            <Maximize2 className="size-4" />
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="ml-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            저장{dirty ? " *" : ""}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative min-h-[50vh] flex-1">
          <MaskViewport
            ref={viewportRef}
            imageUrl={imageUrl}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            surfaces={surfaces}
            activeId={activeId}
            tool={tool}
            selection={selection}
            onRaster={(data, scale) => {
              raster.current = { data, scale };
            }}
            onCanvasClick={onCanvasClick}
            onCanvasDoubleClick={() => {
              if (activeId && tool === "polygon") closePolygon(activeId);
            }}
            onSelect={setSelection}
            onDragStart={snapshot}
            onDragMove={onDragMove}
            onVertexContextMenu={deleteSelectedVertex}
            onSurfaceHit={(id) => {
              setActiveId(id);
              setSelection(null);
            }}
          />
          {active && tool === "polygon" && !active.closed && (
            <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1 text-xs text-white">
              {active.label}: 클릭으로 꼭짓점 추가 ({active.vertices.length}점) · 첫 점 클릭 / 더블클릭 / Enter 로 닫기
            </div>
          )}
          {tool === "quad" && active && (
            <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1 text-xs text-white">
              {active.label}: 실제로 직사각형인 4점을 좌상 → 우상 → 우하 → 좌하 순서로 클릭 ({active.quad?.length ?? 0}/4)
            </div>
          )}
        </div>
        <aside className="w-full shrink-0 border-t md:w-80 md:border-t-0 md:border-l">
          <SurfacePanel
            surfaces={surfaces}
            activeId={activeId}
            onActivate={(id) => {
              setActiveId(id);
              setSelection(null);
            }}
            onAdd={addSurface}
            onRemove={removeSurface}
            onUpdate={(id, patch) => updateSurface(id, patch)}
            onMoveZ={moveZ}
            onClearQuad={(id) => commit((prev) => prev.map((s) => (s.id === id ? { ...s, quad: null } : s)))}
            onClearVertices={(id) => {
              commit((prev) => prev.map((s) => (s.id === id ? { ...s, vertices: [], closed: false } : s)));
              setTool("polygon");
            }}
          />
        </aside>
      </div>
    </div>
  );
}

function ToolItem({ value, label, children }: { value: MaskTool; label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<ToggleGroupItem value={value} aria-label={label} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
