/**
 * 견적 산출 — 타일 매수·면적·자재비 (순수 함수)
 */
import { polygonArea, type Point } from "@/lib/geometry";
import { applyHomography, homographyFromRect, invertHomography } from "@/lib/render/homography";
import { estimateTileCount } from "@/lib/render/tilePattern";
import type { Material } from "@/types/material";
import type { TilePlacement } from "@/types/placement";

export const PYEONG_M2 = 3.305785;

export interface SurfaceDims {
  id: string;
  label: string;
  real_width_mm: number;
  real_height_mm: number;
  /** 마스크 폴리곤 (이미지 px). 있으면 실제 시공 면적을 계산한다 */
  polygon?: readonly Point[];
  /** 원근 4점 (이미지 px). polygon 과 함께 있어야 mm 로 펴서 잴 수 있다 */
  quad?: readonly Point[];
}

/**
 * 표면이 실제로 덮는 비율 (0~1).
 *
 * `real_width_mm × real_height_mm` 는 표면의 바깥 사각형이라, ㄱ자 바닥이나
 * 욕조·문틀이 파인 벽에서는 면적을 과대 산정한다. 폴리곤을 역호모그래피로 mm 평면에
 * 펴서 잰 실제 면적의 비율을 곱해 보정한다 (이미지 픽셀 면적비를 쓰면 원근 때문에 틀린다).
 * 폴리곤이나 quad 가 없으면 1 (기존 동작).
 */
export function coverageRatio(surface: SurfaceDims): number {
  const { polygon, quad, real_width_mm, real_height_mm } = surface;
  if (!polygon || polygon.length < 3 || !quad || quad.length !== 4) return 1;
  if (!(real_width_mm > 0) || !(real_height_mm > 0)) return 1;
  try {
    const invH = invertHomography(homographyFromRect(real_width_mm, real_height_mm, quad));
    const mm = polygon.map((p) => applyHomography(invH, p));
    if (mm.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return 1;
    const ratio = polygonArea(mm) / (real_width_mm * real_height_mm);
    if (!Number.isFinite(ratio) || ratio <= 0) return 1;
    return Math.min(1, ratio);
  } catch {
    return 1;
  }
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
    // 바깥 사각형 기준 결과를 실제 시공 면적 비율로 보정한다
    const ratio = coverageRatio(surface);
    const areaM2 = est.areaM2 * ratio;
    const tileCountExact = est.exact * ratio; // 소수 그대로 (로스 전 이론 매수)
    const tileCount = Math.ceil(est.withLoss * ratio);
    const unitPrice = material.price ?? null;
    const subtotal = unitPrice === null ? null : unitPrice * tileCount;
    if (subtotal === null) hasUnknownPrice = true;
    else totalPrice += subtotal;
    totalAreaM2 += areaM2;
    lines.push({
      surfaceId: surface.id,
      surfaceLabel: surface.label,
      materialId: material.id,
      materialName: material.name,
      areaM2,
      areaPyeong: m2ToPyeong(areaM2),
      tileCountExact,
      tileCount,
      unitPrice,
      subtotal,
    });
  }
  return { lines, totalAreaM2, totalPrice, hasUnknownPrice, lossRate };
}
