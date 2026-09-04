/**
 * 견적 산출 — 타일 매수·면적·자재비 (순수 함수)
 */
import { estimateTileCount } from "@/lib/render/tilePattern";
import type { Material } from "@/types/material";
import type { TilePlacement } from "@/types/placement";

export const PYEONG_M2 = 3.305785;

export interface SurfaceDims {
  id: string;
  label: string;
  real_width_mm: number;
  real_height_mm: number;
}

export interface EstimateLine {
  surfaceId: string;
  surfaceLabel: string;
  materialId: string;
  materialName: string;
  areaM2: number;
  areaPyeong: number;
  tileCountExact: number;
  tileCount: number;
  unitPrice: number | null;
  subtotal: number | null;
}

export interface EstimateSummary {
  lines: EstimateLine[];
  totalAreaM2: number;
  totalPrice: number;
  hasUnknownPrice: boolean;
  lossRate: number;
}

export function m2ToPyeong(m2: number): number {
  return m2 / PYEONG_M2;
}

export function formatKRW(value: number): string {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(value);
}

/**
 * 표면별 타일 배치 → 견적 라인. 로스율(기본 7%)은 사용자가 조정할 수 있다.
 */
export function buildEstimate(
  surfaces: SurfaceDims[],
  placements: TilePlacement[],
  materials: Record<string, Material>,
  lossRate = 0.07,
): EstimateSummary {
  const lines: EstimateLine[] = [];
  let totalAreaM2 = 0;
  let totalPrice = 0;
  let hasUnknownPrice = false;
  for (const surface of surfaces) {
    const placement = placements.find((p) => p.surface_id === surface.id);
    if (!placement) continue;
    const material = materials[placement.material_id];
    if (!material) continue;
    const tileW = material.tile_width_mm ?? 600;
    const tileH = material.tile_height_mm ?? 600;
    const grout = Number(material.grout_width_mm ?? 3);
    const est = estimateTileCount(surface.real_width_mm, surface.real_height_mm, tileW, tileH, grout, lossRate);
    const unitPrice = material.price ?? null;
    const subtotal = unitPrice === null ? null : unitPrice * est.withLoss;
    if (subtotal === null) hasUnknownPrice = true;
    else totalPrice += subtotal;
    totalAreaM2 += est.areaM2;
    lines.push({
      surfaceId: surface.id,
      surfaceLabel: surface.label,
      materialId: material.id,
      materialName: material.name,
      areaM2: est.areaM2,
      areaPyeong: m2ToPyeong(est.areaM2),
      tileCountExact: est.exact,
      tileCount: est.withLoss,
      unitPrice,
      subtotal,
    });
  }
  return { lines, totalAreaM2, totalPrice, hasUnknownPrice, lossRate };
}
