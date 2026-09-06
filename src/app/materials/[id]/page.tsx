import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { MaterialDeleteButton } from "@/components/materials/MaterialDeleteButton";
import { isGuestMaterialsEnabled } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatPrice, materialSourceUrl } from "@/lib/materials/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { FINISH_OPTIONS, KIND_LABELS, MOUNT_OPTIONS, isTileKind, type MaterialMeta } from "@/types/material";

export const metadata: Metadata = { title: "자재 상세" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: material }, { data: auth }] = await Promise.all([
    supabase.from("materials").select("*").eq("id", id).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!material) notFound();

  const tile = isTileKind(material.kind);
  const image = materialSourceUrl(material);
  const meta = (material.meta ?? {}) as MaterialMeta;
  const isOwner = Boolean(auth.user && material.owner_id === auth.user.id);
  const guestMode = isGuestMaterialsEnabled();
  const finishLabel = FINISH_OPTIONS.find((f) => f.value === material.finish)?.label ?? material.finish;
  const mountLabel = MOUNT_OPTIONS.find((m) => m.value === material.mount_type)?.label ?? material.mount_type;

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <Link href="/materials" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          자재 라이브러리
        </Link>
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_360px]">
          <div className={cn("overflow-hidden rounded-xl border", !tile && "checkerboard")}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={material.name} className={cn("w-full", tile ? "object-cover" : "object-contain p-6")} />
            ) : (
              <div className="flex aspect-square items-center justify-center text-sm text-muted-foreground">이미지 없음</div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <Badge variant="secondary">{KIND_LABELS[material.kind]}</Badge>
              <h1 className="mt-2 text-2xl font-semibold">{material.name}</h1>
              <p className="text-sm text-muted-foreground">
                {[material.brand, material.model_code].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-2 text-lg font-semibold tabular-nums">{formatPrice(material.price, material.currency ?? "KRW")}</p>
            </div>
            <dl>
              {tile ? (
                <>
                  <Row label="규격" value={material.tile_width_mm ? `${material.tile_width_mm}×${material.tile_height_mm} mm` : null} />
                  <Row label="줄눈" value={material.grout_color ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-3 rounded-full border" style={{ backgroundColor: material.grout_color }} />
                      {material.grout_color} · {material.grout_width_mm ?? 3}mm
                    </span>
                  ) : null} />
                  <Row label="이음매" value={material.is_seamless ? "없음" : "있음"} />
                  <Row label="랜덤 회전" value={meta.random_rotate ? "사용" : null} />
                </>
              ) : (
                <>
                  <Row label="실제 치수 (W×H×D)" value={material.real_width_mm ? `${material.real_width_mm}×${material.real_height_mm ?? "–"}×${material.real_depth_mm ?? "–"} mm` : null} />
                  <Row label="설치 방식" value={mountLabel} />
                  <Row label="접지점" value={material.anchor_x !== null && material.anchor_y !== null ? `${(Number(material.anchor_x) * 100).toFixed(0)}%, ${(Number(material.anchor_y) * 100).toFixed(0)}%` : null} />
                </>
              )}
              <Row label="마감" value={finishLabel ? `${finishLabel} (gloss ${material.gloss ?? 0.2})` : null} />
              <Row label="대표색" value={material.base_color ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-full border" style={{ backgroundColor: material.base_color }} />
                  {material.base_color}
                </span>
              ) : null} />
              <Row label="태그" value={material.tags?.length ? material.tags.join(", ") : null} />
              <Row label="공개" value={material.is_public ? "공개" : "비공개"} />
            </dl>
            {isOwner && (
              <div className="flex gap-2">
                <MaterialDeleteButton id={material.id} name={material.name} />
              </div>
            )}
            {!isOwner && material.owner_id === null && (
              guestMode ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    소유자가 없는 자재입니다 (샘플 또는 게스트 등록). 게스트 모드에서는 삭제할 수 있습니다.
                  </p>
                  <div className="flex gap-2">
                    <MaterialDeleteButton id={material.id} name={material.name} guest />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">샘플 자재입니다.</p>
              )
            )}
            <Link href={`/materials/new?kind=${material.kind}`} className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
              같은 종류 자재 등록
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
