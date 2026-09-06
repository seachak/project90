"use client";

import { useEffect, useRef } from "react";
import { loadImage } from "@/lib/image/loadImage";
import { cn } from "@/lib/utils";

interface TilePreviewProps {
  src: string | null;
  tileWidthMm: number;
  tileHeightMm: number;
  groutWidthMm: number;
  groutColor: string;
  /** 대리석·우드용 랜덤 90도 회전 미리보기 */
  randomRotate?: boolean;
  cells?: number;
  maxSize?: number;
  className?: string;
}

/** 시드 고정 의사난수 — 미리보기가 렌더마다 흔들리지 않도록 */
function hash(i: number, j: number): number {
  let h = (i * 73856093) ^ (j * 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * 3×3 타일링 미리보기. 실제 렌더러와 같은 규칙(줄눈 폭 mm 비례, 타일별 ±3% 밝기 변화)을 쓴다.
 */
export function TilePreview({
  src,
  tileWidthMm,
  tileHeightMm,
  groutWidthMm,
  groutColor,
  randomRotate = false,
  cells = 3,
  maxSize = 320,
  className,
}: TilePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return;
    let cancelled = false;

    loadImage(src)
      .then((img) => {
        if (cancelled) return;
        const tw = Math.max(1, tileWidthMm);
        const th = Math.max(1, tileHeightMm);
        const g = Math.max(0, groutWidthMm);
        // 셀 크기(px)를 폭·높이 제약 중 작은 쪽으로 결정
        const pxPerMmW = maxSize / (cells * tw + (cells + 1) * g);
        const pxPerMmH = maxSize / (cells * th + (cells + 1) * g);
        const pxPerMm = Math.min(pxPerMmW, pxPerMmH);
        const tilePxW = tw * pxPerMm;
        const tilePxH = th * pxPerMm;
        const groutPx = g * pxPerMm;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cssW = cells * tilePxW + (cells + 1) * groutPx;
        const cssH = cells * tilePxH + (cells + 1) * groutPx;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        const ctx = canvas.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = groutColor;
        ctx.fillRect(0, 0, cssW, cssH);

        for (let j = 0; j < cells; j++) {
          for (let i = 0; i < cells; i++) {
            const x = groutPx + i * (tilePxW + groutPx);
            const y = groutPx + j * (tilePxH + groutPx);
            const r = hash(i, j);
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, tilePxW, tilePxH);
            ctx.clip();
            ctx.translate(x + tilePxW / 2, y + tilePxH / 2);
            // 시뮬레이터(patternCanvas)와 같은 규칙: ±1.5% 밝기 편차를 filter 로 (색·채도 보존)
            const delta = (r - 0.5) * 0.03;
            const canFilter = typeof ctx.filter === "string";
            if (canFilter) ctx.filter = `brightness(${(1 + delta).toFixed(4)})`;
            if (randomRotate) {
              const quarter = Math.floor(hash(j, i) * 4);
              ctx.rotate((quarter * Math.PI) / 2);
              if (quarter % 2 === 1) ctx.drawImage(img, -tilePxH / 2, -tilePxW / 2, tilePxH, tilePxW);
              else ctx.drawImage(img, -tilePxW / 2, -tilePxH / 2, tilePxW, tilePxH);
            } else {
              ctx.drawImage(img, -tilePxW / 2, -tilePxH / 2, tilePxW, tilePxH);
            }
            if (canFilter) ctx.filter = "none";
            else {
              ctx.fillStyle = delta >= 0 ? `rgba(255,255,255,${delta})` : `rgba(0,0,0,${-delta})`;
              ctx.fillRect(-tilePxW, -tilePxH, tilePxW * 2, tilePxH * 2);
            }
            // 줄눈 그늘 — 시뮬레이터와 같은 규칙
            ctx.rotate(0);
            const band = Math.min(Math.max(groutPx * 0.6, 0.4), Math.min(tilePxW, tilePxH) / 6);
            if (band > 0 && groutPx > 0) {
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.strokeStyle = "rgba(0,0,0,0.22)";
              ctx.lineWidth = band;
              ctx.strokeRect(x + band / 2, y + band / 2, tilePxW - band, tilePxH - band);
              ctx.strokeStyle = "rgba(0,0,0,0.088)";
              ctx.strokeRect(x + band * 1.5, y + band * 1.5, tilePxW - band * 3, tilePxH - band * 3);
            }
            ctx.restore();
          }
        }
      })
      .catch(() => {
        /* 이미지 로드 실패 시 빈 캔버스 유지 */
      });

    return () => {
      cancelled = true;
    };
  }, [src, tileWidthMm, tileHeightMm, groutWidthMm, groutColor, randomRotate, cells, maxSize]);

  if (!src) {
    return (
      <div
        className={cn(
          "flex aspect-square items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground",
          className,
        )}
        style={{ width: maxSize, height: maxSize }}
      >
        타일 이미지를 올리면 3×3 미리보기가 표시됩니다
      </div>
    );
  }

  return <canvas ref={canvasRef} className={cn("rounded-lg border bg-muted", className)} />;
}
