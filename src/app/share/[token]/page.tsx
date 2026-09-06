import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatKRW, m2ToPyeong } from "@/lib/estimate";
import { parseSnapshotState } from "@/lib/projects/snapshotState";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { KIND_LABELS, type MaterialKind } from "@/types/material";

export const metadata: Metadata = { title: "공유된 시뮬레이션" };

/** 공유 스냅샷은 자주 바뀌지 않지만 새 저장이 반영되도록 짧게 캐시한다 */
export const revalidate = 60;

interface SharedSnapshot {
  id: string;
  title: string | null;
  image_url: string | null;
  state: unknown;
  created_at: string | null;
  project_name: string | null;
  width_px: number | null;
  height_px: number | null;
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind as MaterialKind] ?? kind;
}

/**
 * 공유 뷰어 — 로그인 불필요.
 *
 * `get_shared_snapshot` RPC(security definer, anon 실행 허용)로 조회하므로
 * 토큰을 아는 사람만 볼 수 있고, 원본 현장 사진이나 다른 프로젝트는 노출되지 않는다.
 * 화면에 필요한 자재·표면 정보는 전부 스냅샷 state 안에 들어 있다.
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_snapshot", { p_token: token });
  if (error) console.error(error);

  const snapshot = (Array.isArray(data) ? data[0] : data) as SharedSnapshot | undefined;
  if (!snapshot) notFound();

  const state = parseSnapshotState(snapshot.state);
  const materialById = new Map(state.materials.map((m) => [m.id, m]));
  const surfaceById = new Map(state.surfaces.map((s) => [s.id, s]));

  const tileRows = state.tilePlacements.map((p) => ({
    key: p.id,
    surface: surfaceById.get(p.surface_id)?.label ?? "표면",
    material: materialById.get(p.material_id),
    line: state.estimate?.lines.find((l) => l.surfaceId === p.surface_id) ?? null,
  }));
  const objectRows = state.objectPlacements.map((p) => ({
    key: p.id,
    material: materialById.get(p.material_id),
  }));

  const objectTotal = objectRows.reduce((sum, r) => sum + (r.material?.price ?? 0), 0);
  const tileTotal = state.estimate?.totalPrice ?? 0;
  const total = tileTotal + objectTotal;
  const created = snapshot.created_at ? new Date(snapshot.created_at) : null;

  return (
    <div className="min-h-svh bg-background">
      <header className="flex h-14 items-center gap-3 border-b px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">90</span>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{snapshot.title ?? snapshot.project_name ?? "시뮬레이션"}</h1>
          {created && (
            <p className="text-[11px] text-muted-foreground">
              {created.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} 저장
            </p>
          )}
        </div>
        <Badge variant="outline" className="ml-auto shrink-0">
          공유 보기
        </Badge>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          {snapshot.image_url ? (
            <div className="overflow-hidden rounded-xl border bg-muted">
              <Image
                src={snapshot.image_url}
                alt={snapshot.title ?? "시뮬레이션 결과"}
                width={snapshot.width_px ?? 1600}
                height={snapshot.height_px ?? 1200}
                className="h-auto w-full"
                sizes="(min-width: 1024px) 800px, 100vw"
                priority
              />
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              저장된 이미지가 없습니다.
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4 text-sm">
          <div className="rounded-xl border p-4">
            <h2 className="mb-3 font-semibold">적용 자재</h2>
            {tileRows.length === 0 && objectRows.length === 0 ? (
              <p className="text-muted-foreground">적용된 자재가 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {tileRows.map((r) => (
                  <li key={r.key} className="flex gap-2">
                    {r.material?.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.material.thumbnail_url} alt="" className="size-10 shrink-0 rounded object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{r.material?.name ?? "자재"}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{r.surface}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.material?.brand && <span>{r.material.brand} · </span>}
                        {r.material?.tile_width_mm && r.material?.tile_height_mm && (
                          <span>
                            {r.material.tile_width_mm}×{r.material.tile_height_mm}mm
                          </span>
                        )}
                      </div>
                      {r.line && (
                        <div className="mt-0.5 flex justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            {r.line.areaM2.toFixed(2)}㎡ ({m2ToPyeong(r.line.areaM2).toFixed(2)}평) · {r.line.tileCount}장
                          </span>
                          {r.line.subtotal !== null && <span className="font-medium">{formatKRW(r.line.subtotal)}</span>}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
                {objectRows.map((r) => (
                  <li key={r.key} className="flex gap-2">
                    {r.material?.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.material.thumbnail_url} alt="" className="size-10 shrink-0 rounded object-contain" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{r.material?.name ?? "위생도기"}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{kindLabel(r.material?.kind ?? "")}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">
                          {r.material?.real_width_mm ? `${r.material.real_width_mm}mm` : ""}
                        </span>
                        {r.material?.price !== null && r.material?.price !== undefined && (
                          <span className="font-medium">{formatKRW(r.material.price)}</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {total > 0 && (
            <div className="rounded-xl border p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">합계</span>
                <span className="text-lg font-semibold">{formatKRW(total)}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                자재비만 포함한 개략 금액입니다 (시공비 별도)
                {state.estimate ? ` · 로스율 ${Math.round(state.estimate.lossRate * 100)}%` : ""}.
                {state.estimate?.hasUnknownPrice && " 가격이 없는 자재는 제외했습니다."}
              </p>
            </div>
          )}

          <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            내 현장 사진으로 시뮬레이션 해보기
          </Link>
        </aside>
      </main>
    </div>
  );
}
