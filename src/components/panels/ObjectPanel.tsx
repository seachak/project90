"use client";

import { FlipHorizontal2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { materialImageUrl } from "@/lib/materials/queries";
import { MAX_USER_SCALE, MIN_USER_SCALE } from "@/lib/render/fixture";
import { useProjectStore } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";

/**
 * 선택된 위생도기의 속성 패널.
 *
 * 크기는 바닥 호모그래피에서 자동으로 산출되므로 여기 슬라이더는 "미세조정"이다 (기본 1.0 = 자동 크기).
 * 마스킹이 살짝 어긋난 사진에서 보정할 때만 쓴다. 더블클릭하면 자동 크기로 돌아간다.
 */
export function ObjectPanel({ className }: { className?: string }) {
  const selectedId = useProjectStore((s) => s.selectedObjectId);
  const placements = useProjectStore((s) => s.objectPlacements);
  const materials = useProjectStore((s) => s.materials);
  const update = useProjectStore((s) => s.updateObjectPlacement);
  const remove = useProjectStore((s) => s.removeObjectPlacement);
  const selectObject = useProjectStore((s) => s.selectObject);

  const placement = placements.find((p) => p.id === selectedId) ?? null;
  const material = placement ? materials[placement.material_id] : null;
  if (!placement || !material) return null;

  const thumb = materialImageUrl(material);
  const autoSize = Math.abs(placement.scale - 1) < 0.001;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-2 text-xs", className)}>
      <div className="flex items-center gap-1.5">
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="size-6 rounded-sm object-contain" />
        )}
        <span className="max-w-40 truncate font-medium" title={material.name}>
          {material.name}
        </span>
        {material.real_width_mm && <span className="text-muted-foreground">{material.real_width_mm}mm</span>}
      </div>

      <div className="flex w-52 items-center gap-1.5">
        <Label className="whitespace-nowrap text-xs">
          크기 {autoSize ? "자동" : `${Math.round(placement.scale * 100)}%`}
        </Label>
        <Slider
          min={MIN_USER_SCALE}
          max={MAX_USER_SCALE}
          step={0.01}
          value={placement.scale}
          onValueChange={(v) => update(placement.id, { scale: Array.isArray(v) ? v[0] : v }, { history: false })}
          onDoubleClick={() => update(placement.id, { scale: 1 })}
          aria-label="도기 크기 미세조정 (기본값 자동)"
        />
        {!autoSize && (
          <Button size="icon-xs" variant="ghost" title="자동 크기로 되돌리기" onClick={() => update(placement.id, { scale: 1 })}>
            <RotateCcw className="size-3" />
          </Button>
        )}
      </div>

      <div className="flex w-44 items-center gap-1.5">
        <Label className="whitespace-nowrap text-xs">회전 {Math.round(placement.rotation)}°</Label>
        <Slider
          min={-45}
          max={45}
          step={1}
          value={placement.rotation}
          onValueChange={(v) => update(placement.id, { rotation: Array.isArray(v) ? v[0] : v }, { history: false })}
          onDoubleClick={() => update(placement.id, { rotation: 0 })}
          aria-label="도기 회전"
        />
      </div>

      <Button
        size="xs"
        variant={placement.flip_x ? "secondary" : "ghost"}
        onClick={() => update(placement.id, { flip_x: !placement.flip_x })}
        aria-pressed={placement.flip_x}
      >
        <FlipHorizontal2 className="size-3" data-icon="inline-start" />
        좌우 반전
      </Button>

      <span className="text-muted-foreground">드래그로 이동 · 방향키 미세이동 · Delete 삭제</span>

      <Button
        size="xs"
        variant="ghost"
        className="ml-auto text-destructive"
        onClick={() => {
          remove(placement.id);
          selectObject(null);
        }}
      >
        <X className="size-3" />
        도기 제거
      </Button>
    </div>
  );
}
