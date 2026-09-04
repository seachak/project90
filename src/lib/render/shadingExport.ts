/**
 * 표면 shading map 을 PNG 로 만들어 Storage(renders 버킷)에 캐시한다 — 마스크 저장 시 호출.
 * 렌더러는 shading_url 이 없어도 즉석 계산하므로, 실패해도 치명적이지 않다.
 */
import { flattenPath } from "@/lib/geometry";
import { canvasToBlob } from "@/lib/image/loadImage";
import type { RasterLike } from "@/lib/image/palette";
import { rasterizePolygon } from "@/lib/mask/rasterize";
import { computeShading, encodeShading } from "@/lib/render/shading";
import { uploadWithProgress } from "@/lib/storage/upload";
import type { EditableSurface } from "@/types/surface";

export interface ShadingUploadContext {
  userId: string;
  projectId: string;
  /** 다운스케일된 원본 래스터와 (원본 px → 래스터 px) 배율 */
  raster: RasterLike;
  rasterScale: number;
}

/** 단일 표면의 shading PNG Blob */
export async function buildShadingBlob(surface: EditableSurface, raster: RasterLike, rasterScale: number): Promise<Blob | null> {
  const polygon = flattenPath(surface.vertices, true);
  if (polygon.length < 3) return null;
  const mask = rasterizePolygon(polygon, raster.width, raster.height, rasterScale);
  const result = computeShading(raster, mask);
  const rgba = encodeShading(result, mask);
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  canvas.getContext("2d")!.putImageData(new ImageData(rgba, raster.width, raster.height), 0, 0);
  return canvasToBlob(canvas, "image/png");
}

/**
 * 여러 표면의 shading map 을 업로드하고 { surfaceId: publicUrl } 을 돌려준다.
 * 실패한 표면은 null (렌더러가 즉석 계산).
 */
export async function uploadShadingMaps(
  surfaces: EditableSurface[],
  ctx: ShadingUploadContext,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  let done = 0;
  for (const surface of surfaces) {
    try {
      const blob = await buildShadingBlob(surface, ctx.raster, ctx.rasterScale);
      if (!blob) {
        out[surface.id] = null;
        continue;
      }
      const path = `${ctx.userId}/${ctx.projectId}/shading/${surface.id}.png`;
      const { publicUrl } = await uploadWithProgress({ bucket: "renders", path, file: blob, contentType: "image/png", upsert: true });
      // 같은 경로에 덮어쓰므로 캐시 무효화를 위해 버전 쿼리를 붙인다
      out[surface.id] = publicUrl ? `${publicUrl}?v=${Date.now()}` : null;
    } catch (err) {
      console.warn("shading upload failed", surface.label, err);
      out[surface.id] = null;
    } finally {
      done++;
      onProgress?.(done, surfaces.length);
    }
  }
  return out;
}
