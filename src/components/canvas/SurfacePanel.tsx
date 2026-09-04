"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { SURFACE_COLORS, SURFACE_TYPE_OPTIONS, type EditableSurface, type SurfaceType } from "@/types/surface";

interface SurfacePanelProps {
  surfaces: EditableSurface[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onAdd: (type: SurfaceType) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<EditableSurface>) => void;
  onMoveZ: (id: string, direction: -1 | 1) => void;
  onClearQuad: (id: string) => void;
  onClearVertices: (id: string) => void;
}

export function SurfacePanel({
  surfaces,
  activeId,
  onActivate,
  onAdd,
  onRemove,
  onUpdate,
  onMoveZ,
  onClearQuad,
  onClearVertices,
}: SurfacePanelProps) {
  const active = surfaces.find((s) => s.id === activeId) ?? null;
  const sorted = [...surfaces].sort((a, b) => a.z_order - b.z_order);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">표면 ({surfaces.length})</h2>
          <div className="flex gap-1">
            <Button size="xs" variant="outline" onClick={() => onAdd("floor")}>
              <Plus className="size-3" />
              바닥
            </Button>
            <Button size="xs" variant="outline" onClick={() => onAdd("wall")}>
              <Plus className="size-3" />벽
            </Button>
            <Button size="xs" variant="outline" onClick={() => onAdd("ceiling")}>
              <Plus className="size-3" />
              천장
            </Button>
          </div>
        </div>
        {sorted.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            바닥이나 벽을 추가한 뒤 사진 위에 영역을 그리세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sorted.map((s) => {
              const hasQuad = Boolean(s.quad && s.quad.length === 4);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onActivate(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left hover:bg-muted",
                      s.id === activeId && "border-foreground bg-muted",
                    )}
                  >
                    <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: SURFACE_COLORS[s.surface_type] }} />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {s.vertices.length}점{s.closed ? "" : " (열림)"} · {hasQuad ? "원근 ✓" : "원근 –"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {active && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">선택한 표면</h3>
            <div className="flex gap-1">
              <Button size="icon-xs" variant="ghost" title="뒤로 (z-order ↓)" onClick={() => onMoveZ(active.id, -1)}>
                <ArrowDown className="size-3" />
              </Button>
              <Button size="icon-xs" variant="ghost" title="앞으로 (z-order ↑)" onClick={() => onMoveZ(active.id, 1)}>
                <ArrowUp className="size-3" />
              </Button>
              <Button size="icon-xs" variant="ghost" className="text-destructive" title="표면 삭제" onClick={() => onRemove(active.id)}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="surface-label">라벨</Label>
            <Input id="surface-label" value={active.label} onChange={(e) => onUpdate(active.id, { label: e.target.value })} placeholder="예: 좌측벽" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>종류</Label>
            <ToggleGroup
              value={[active.surface_type]}
              onValueChange={(v) => {
                const next = (v as SurfaceType[])[0];
                if (next) onUpdate(active.id, { surface_type: next });
              }}
              variant="outline"
              size="sm"
              spacing={0}
            >
              {SURFACE_TYPE_OPTIONS.map((o) => (
                <ToggleGroupItem key={o.value} value={o.value}>
                  {o.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="real-w">실제 가로 (mm)</Label>
              <Input
                id="real-w"
                type="number"
                inputMode="numeric"
                min={1}
                value={active.real_width_mm ?? ""}
                onChange={(e) => onUpdate(active.id, { real_width_mm: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="예: 1800"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="real-h">실제 {active.surface_type === "floor" ? "세로" : "높이"} (mm)</Label>
              <Input
                id="real-h"
                type="number"
                inputMode="numeric"
                min={1}
                value={active.real_height_mm ?? ""}
                onChange={(e) => onUpdate(active.id, { real_height_mm: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="예: 2400"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            실제 치수는 타일 매수 계산과 위생도기 자동 스케일에 쓰입니다. 원근 4점(quad)이 곧 이 직사각형입니다.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>원근 4점 (quad)</Label>
            <p className="text-xs text-muted-foreground">
              {active.quad && active.quad.length === 4
                ? "지정됨 — 격자가 표면과 나란한지 확인하세요."
                : active.quad && active.quad.length > 0
                  ? `${active.quad.length}/4 점 지정 중 — 좌상 → 우상 → 우하 → 좌하 순서로 클릭`
                  : "미지정 — 저장 시 폴리곤 바운딩 박스를 임시로 사용합니다 (벽·바닥은 꼭 지정하세요)."}
            </p>
            <div className="flex gap-1">
              <Button size="xs" variant="outline" onClick={() => onClearQuad(active.id)} disabled={!active.quad}>
                원근 초기화
              </Button>
              <Button size="xs" variant="outline" onClick={() => onClearVertices(active.id)} disabled={active.vertices.length === 0}>
                영역 다시 그리기
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">단축키</p>
        V 선택 · P 폴리곤 · W 매직완드 · Q 원근 4점 · H 손(이동) · Space+드래그 이동 · 휠 확대/축소
        <br />
        클릭 꼭짓점 추가 · 첫 점 클릭/더블클릭/Enter 닫기 · 우클릭 꼭짓점 삭제 · C 곡선 핸들 토글 · Delete 삭제 · Ctrl+Z/Y 실행취소/재실행 · 0 화면 맞춤
      </div>
    </div>
  );
}
