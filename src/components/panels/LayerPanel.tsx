"use client";

import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ObjectPanel } from "@/components/panels/ObjectPanel";
import { materialImageUrl } from "@/lib/materials/queries";
import { useProjectStore } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import { PATTERN_OPTIONS, type TilePattern } from "@/types/material";
import { SURFACE_COLORS, surfaceTypeOf } from "@/types/surface";

/** 하단 레이어 패널: 표면 선택 + 선택 표면의 타일 패턴 옵션 */
export function LayerPanel({ className }: { className?: string }) {
  const surfaces = useProjectStore((s) => s.surfaces);
  const selectedId = useProjectStore((s) => s.selectedSurfaceId);
  const selectSurface = useProjectStore((s) => s.selectSurface);
  const placements = useProjectStore((s) => s.tilePlacements);
  const materials = useProjectStore((s) => s.materials);
  const update = useProjectStore((s) => s.updateTilePlacement);
  const remove = useProjectStore((s) => s.removeTilePlacement);
  const objects = useProjectStore((s) => s.objectPlacements);
  const selectedObjectId = useProjectStore((s) => s.selectedObjectId);
  const selectObject = useProjectStore((s) => s.selectObject);

  const placement = placements.find((p) => p.surface_id === selectedId) ?? null;
  const material = placement ? materials[placement.material_id] : null;

  return (
    <div className={cn("flex h-full flex-col gap-2 overflow-hidden p-2 text-xs", className)}>
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 font-semibold">레이어</span>
        {surfaces.length === 0 && <span className="text-muted-foreground">표면이 없습니다. 마스킹 에디터에서 벽/바닥을 지정하세요.</span>}
        {surfaces.map((s) => {
          const p = placements.find((x) => x.surface_id === s.id);
          const m = p ? materials[p.material_id] : null;
          const thumb = m ? materialImageUrl(m) : null;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSurface(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-muted",
                s.id === selectedId && "border-foreground bg-muted",
              )}
            >
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: SURFACE_COLORS[surfaceTypeOf(s.surface_type)] }} />
              <span>{s.label}</span>
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="size-5 rounded-sm object-cover" />
              ) : (
                <span className="text-muted-foreground">(미적용)</span>
              )}
            </button>
          );
        })}
        {objects.length > 0 && <span className="mx-1 h-4 w-px shrink-0 bg-border" />}
        {objects.map((o) => {
          const m = materials[o.material_id];
          const thumb = m ? materialImageUrl(m) : null;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => selectObject(o.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-muted",
                o.id === selectedObjectId && "border-foreground bg-muted",
              )}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="size-5 rounded-sm object-contain" />
              ) : (
                <span className="size-2.5 rounded-full bg-sky-500" />
              )}
              <span className="max-w-24 truncate">{m?.name ?? "도기"}</span>
            </button>
          );
        })}
      </div>

      {selectedObjectId && <ObjectPanel />}

      {!selectedObjectId && placement && material && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-2">
          <span className="max-w-40 truncate font-medium" title={material.name}>
            {material.name}
          </span>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">패턴</Label>
            <ToggleGroup
              value={[placement.pattern]}
              onValueChange={(v) => {
                const next = (v as TilePattern[])[0];
                if (next) update(placement.id, { pattern: next });
              }}
              variant="outline"
              size="sm"
              spacing={0}
            >
              {PATTERN_OPTIONS.map((p) => (
                <ToggleGroupItem key={p.value} value={p.value} title={p.description} className="px-1.5 text-[11px]">
                  {p.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="off-x" className="text-xs">
              오프셋 X
            </Label>
            <Input id="off-x" type="number" step={10} value={placement.offset_x_mm} onChange={(e) => update(placement.id, { offset_x_mm: Number(e.target.value) || 0 })} className="h-6 w-20 text-xs" />
            <Label htmlFor="off-y" className="text-xs">
              Y
            </Label>
            <Input id="off-y" type="number" step={10} value={placement.offset_y_mm} onChange={(e) => update(placement.id, { offset_y_mm: Number(e.target.value) || 0 })} className="h-6 w-20 text-xs" />
            <span className="text-muted-foreground">mm</span>
          </div>
          <div className="flex w-44 items-center gap-1.5">
            <Label className="text-xs whitespace-nowrap">회전 {placement.rotate_deg}°</Label>
            <Slider min={-90} max={90} step={1} value={placement.rotate_deg} onValueChange={(v) => update(placement.id, { rotate_deg: Array.isArray(v) ? v[0] : v })} aria-label="패턴 회전" />
          </div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="grout" className="text-xs">
              줄눈
            </Label>
            <input
              id="grout"
              type="color"
              value={placement.grout_override ?? material.grout_color ?? "#d8d5d0"}
              onChange={(e) => update(placement.id, { grout_override: e.target.value })}
              className="size-6 cursor-pointer rounded border bg-transparent p-0.5"
            />
            {placement.grout_override && (
              <Button size="icon-xs" variant="ghost" title="줄눈 색 원복" onClick={() => update(placement.id, { grout_override: null })}>
                <RotateCcw className="size-3" />
              </Button>
            )}
          </div>
          <Button size="xs" variant="ghost" className="ml-auto text-destructive" onClick={() => remove(placement.surface_id)}>
            <X className="size-3" />
            자재 제거
          </Button>
        </div>
      )}
    </div>
  );
}
