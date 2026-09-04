"use client";

import Link from "next/link";
import { ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  formatObjectSize,
  formatPrice,
  formatTileSize,
  materialImageUrl,
} from "@/lib/materials/queries";
import { cn } from "@/lib/utils";
import { KIND_LABELS, isTileKind, type Material } from "@/types/material";

interface MaterialCardProps {
  material: Material;
  view?: "grid" | "list";
  href?: string;
  selected?: boolean;
  onSelect?: (material: Material) => void;
  onHoverStart?: (material: Material) => void;
  onHoverEnd?: (material: Material) => void;
  className?: string;
}

function Thumb({ material, className }: { material: Material; className?: string }) {
  const url = materialImageUrl(material);
  const tile = isTileKind(material.kind);
  if (!url) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageOff className="size-5" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={material.name}
      loading="lazy"
      decoding="async"
      className={cn(tile ? "object-cover" : "checkerboard object-contain p-1", className)}
    />
  );
}

/** 자재 카드 (그리드) / 행 (리스트) — 라이브러리와 시뮬레이터 패널에서 공용 */
export function MaterialCard({
  material,
  view = "grid",
  href,
  selected,
  onSelect,
  onHoverStart,
  onHoverEnd,
  className,
}: MaterialCardProps) {
  const size = isTileKind(material.kind) ? formatTileSize(material) : formatObjectSize(material);
  const meta = (
    <>
      <p className="truncate text-sm font-medium" title={material.name}>
        {material.name}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {[material.brand, size ? `${size}mm` : null].filter(Boolean).join(" · ") || " "}
      </p>
    </>
  );

  const interactive = {
    onClick: onSelect ? () => onSelect(material) : undefined,
    onMouseEnter: onHoverStart ? () => onHoverStart(material) : undefined,
    onMouseLeave: onHoverEnd ? () => onHoverEnd(material) : undefined,
  };

  const body =
    view === "grid" ? (
      <div
        className={cn(
          "group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/30",
          selected && "ring-2 ring-primary",
          className,
        )}
        {...interactive}
      >
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          <Thumb material={material} className="size-full" />
          <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px]">
            {KIND_LABELS[material.kind]}
          </Badge>
          {material.base_color && (
            <span
              className="absolute right-1.5 bottom-1.5 size-4 rounded-full border border-white/70 shadow"
              style={{ backgroundColor: material.base_color }}
              title={material.base_color}
            />
          )}
        </div>
        <div className="flex flex-col gap-0.5 p-2.5">
          {meta}
          <p className="text-xs font-medium tabular-nums">{formatPrice(material.price, material.currency ?? "KRW")}</p>
        </div>
      </div>
    ) : (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-card p-2 transition-colors hover:border-foreground/30",
          selected && "ring-2 ring-primary",
          className,
        )}
        {...interactive}
      >
        <Thumb material={material} className="size-12 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">{meta}</div>
        <Badge variant="outline" className="hidden sm:inline-flex">
          {KIND_LABELS[material.kind]}
        </Badge>
        <p className="w-24 text-right text-xs font-medium tabular-nums">
          {formatPrice(material.price, material.currency ?? "KRW")}
        </p>
      </div>
    );

  if (href) {
    return (
      <Link href={href} className="block outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {body}
      </Link>
    );
  }
  return body;
}
