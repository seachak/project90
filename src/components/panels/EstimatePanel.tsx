"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { buildEstimate, formatKRW, m2ToPyeong } from "@/lib/estimate";
import { KIND_LABELS } from "@/types/material";
import { useProjectStore } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";

/** 우측 하단 견적 요약 — 타일 매수(로스율 반영)·면적(㎡/평)·자재비 */
export function EstimatePanel({ className }: { className?: string }) {
  const surfaces = useProjectStore((s) => s.surfaces);
  const placements = useProjectStore((s) => s.tilePlacements);
  const objects = useProjectStore((s) => s.objectPlacements);
  const materials = useProjectStore((s) => s.materials);
  const [lossRate, setLossRate] = useState(7);

  const estimate = useMemo(
    () => buildEstimate(surfaces, placements, materials, lossRate / 100),
    [surfaces, placements, materials, lossRate],
  );

  // 위생도기는 개수 단위라 타일 견적(매수·면적)과 따로 더한다
  const objectLines = useMemo(
    () =>
      objects
        .map((o) => ({ id: o.id, material: materials[o.material_id] }))
        .filter((r): r is { id: string; material: NonNullable<typeof r.material> } => Boolean(r.material)),
    [objects, materials],
  );
  const objectTotal = objectLines.reduce((sum, r) => sum + Number(r.material.price ?? 0), 0);
  const hasUnknownObjectPrice = objectLines.some((r) => r.material.price === null || r.material.price === undefined);
  const grandTotal = estimate.totalPrice + objectTotal;

  return (
    <div className={cn("flex flex-col gap-2 p-3 text-xs", className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">견적 요약</h3>
        <div className="flex w-36 items-center gap-2">
          <Label className="text-[11px] whitespace-nowrap">로스 {lossRate}%</Label>
          <Slider min={5} max={10} step={1} value={lossRate} onValueChange={(v) => setLossRate(Array.isArray(v) ? v[0] : v)} aria-label="로스율" />
        </div>
      </div>
      {estimate.lines.length === 0 && objectLines.length === 0 ? (
        <p className="text-muted-foreground">자재를 적용하면 매수와 자재비가 계산됩니다.</p>
      ) : (
        <table className="w-full">
          <tbody>
            {estimate.lines.map((l) => (
              <tr key={l.surfaceId} className="border-t">
                <td className="py-1 pr-2 align-top">
                  <div className="font-medium">{l.surfaceLabel}</div>
                  <div className="truncate text-muted-foreground" title={l.materialName}>
                    {l.materialName}
                  </div>
                  <div className="text-muted-foreground">
                    {l.areaM2.toFixed(2)}㎡ ({l.areaPyeong.toFixed(2)}평)
                  </div>
                </td>
                <td className="py-1 text-right align-top tabular-nums">
                  <div>{l.tileCount}장</div>
                  <div className="text-muted-foreground">{l.subtotal === null ? "가격 미정" : formatKRW(l.subtotal)}</div>
                </td>
              </tr>
            ))}
            {objectLines.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1 pr-2 align-top">
                  <div className="font-medium">{KIND_LABELS[r.material.kind]}</div>
                  <div className="truncate text-muted-foreground" title={r.material.name}>
                    {r.material.name}
                  </div>
                </td>
                <td className="py-1 text-right align-top tabular-nums">
                  <div>1개</div>
                  <div className="text-muted-foreground">
                    {r.material.price === null || r.material.price === undefined ? "가격 미정" : formatKRW(Number(r.material.price))}
                  </div>
                </td>
              </tr>
            ))}
            <tr className="border-t font-semibold">
              <td className="py-1">
                합계 {estimate.totalAreaM2.toFixed(2)}㎡ ({m2ToPyeong(estimate.totalAreaM2).toFixed(2)}평)
              </td>
              <td className="py-1 text-right tabular-nums">
                {formatKRW(grandTotal)}
                {(estimate.hasUnknownPrice || hasUnknownObjectPrice) && "+"}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
