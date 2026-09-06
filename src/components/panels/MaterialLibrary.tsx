"use client";

import Link from "next/link";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { MaterialCard } from "@/components/materials/MaterialCard";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchMaterials } from "@/lib/materials/queries";
import { listLocalMaterials } from "@/lib/materials/localStore";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/env";
import { useProjectStore } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import { KIND_LABELS, isObjectKind, isTileKind, type Material, type MaterialKind } from "@/types/material";

interface MaterialLibraryProps {
  /** 데모 모드: 정적 자재 목록. 없으면 Supabase 에서 조회 */
  staticMaterials?: Material[];
  className?: string;
  onPreload?: (material: Material) => void;
}

const KINDS: MaterialKind[] = ["tile_floor", "tile_wall", "toilet", "basin", "bathtub", "faucet", "accessory"];

/** 시뮬레이터 좌측 자재 라이브러리 — 클릭 적용, 호버 미리보기 */
export function MaterialLibrary({ staticMaterials, className, onPreload }: MaterialLibraryProps) {
  const selectedSurfaceId = useProjectStore((s) => s.selectedSurfaceId);
  const surfaces = useProjectStore((s) => s.surfaces);
  const tilePlacements = useProjectStore((s) => s.tilePlacements);
  const applyTile = useProjectStore((s) => s.applyTile);
  const applyObject = useProjectStore((s) => s.applyObject);
  const setHover = useProjectStore((s) => s.setHoverMaterial);
  const upsertMaterials = useProjectStore((s) => s.upsertMaterials);

  const selectedSurface = surfaces.find((s) => s.id === selectedSurfaceId) ?? null;
  const [kind, setKind] = useState<MaterialKind>("tile_floor");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Material[]>(staticMaterials ?? []);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const requestId = useRef(0);
  /** 이 브라우저에 등록한 자재 (Supabase 없이 쓰는 경로) */
  const [localItems, setLocalItems] = useState<Material[]>([]);

  // 로컬 자재는 항상 함께 보여준다 — 데모 모드에서도 내가 올린 실물 자재를 바로 얹어볼 수 있게
  useEffect(() => {
    let active = true;
    void listLocalMaterials().then((list) => {
      if (!active) return;
      setLocalItems(list);
      if (list.length > 0) upsertMaterials(list);
    });
    return () => {
      active = false;
    };
  }, [upsertMaterials]);

  // 선택한 표면 종류에 맞춰 탭 자동 전환
  useEffect(() => {
    if (!selectedSurface) return;
    setKind(selectedSurface.surface_type === "wall" ? "tile_wall" : "tile_floor");
  }, [selectedSurface?.id, selectedSurface?.surface_type]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // 정적 목록이 주어졌거나 Supabase 가 없으면 원격 조회를 하지 않는다
    // (createClient() 는 환경변수가 없으면 throw 한다)
    if (staticMaterials || !hasSupabaseEnv()) return;
    const id = ++requestId.current;
    setLoading(true);
    fetchMaterials(createClient(), { kind, search, hue: null, size: null, page: 0, pageSize: 40 })
      .then((r) => {
        if (id !== requestId.current) return;
        setItems(r.items);
        setHasMore(r.hasMore);
        setPage(0);
        upsertMaterials(r.items);
      })
      .catch((err) => console.warn(err))
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [kind, search, staticMaterials, upsertMaterials]);

  const loadMore = async () => {
    if (staticMaterials || !hasSupabaseEnv() || loading || !hasMore) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const r = await fetchMaterials(createClient(), { kind, search, hue: null, size: null, page: page + 1, pageSize: 40 });
      if (id !== requestId.current) return;
      setItems((prev) => [...prev, ...r.items]);
      setHasMore(r.hasMore);
      setPage(page + 1);
      upsertMaterials(r.items);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (m: Material) =>
      m.kind === kind && (!q || m.name.toLowerCase().includes(q) || (m.brand ?? "").toLowerCase().includes(q));
    // 내가 등록한 자재를 맨 앞에 (샘플보다 먼저 보이게).
    // 로컬 시뮬레이터는 같은 자재가 staticMaterials 로도 들어오므로 id 로 중복을 제거한다.
    const mine = localItems.filter(matches);
    const seen = new Set(mine.map((m) => m.id));
    const rest = (staticMaterials ?? items).filter((m) => matches(m) && !seen.has(m.id));
    return [...mine, ...rest];
  }, [staticMaterials, items, localItems, kind, search]);

  const appliedId = tilePlacements.find((p) => p.surface_id === selectedSurfaceId)?.material_id ?? null;
  const tileTab = isTileKind(kind);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="border-b p-2">
        <Tabs value={kind} onValueChange={(v) => setKind(v as MaterialKind)}>
          <TabsList variant="line" className="h-auto w-full flex-wrap justify-start">
            {KINDS.map((k) => (
              <TabsTrigger key={k} value={k} className="px-1.5 text-xs">
                {KIND_LABELS[k]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="자재 검색" className="h-7 pl-7 text-xs" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-muted-foreground">
            내 자재 {localItems.length}개
          </span>
          <Link href="/materials/new" className="shrink-0 text-[11px] font-medium underline underline-offset-2 hover:text-foreground">
            + 실물 자재 등록
          </Link>
        </div>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {!tileTab ? (
            "클릭하면 바닥에 놓입니다 — 드래그로 위치를 옮기면 크기가 원근에 맞춰 자동 조절됩니다"
          ) : selectedSurface ? (
            <>
              적용 대상: <span className="font-medium text-foreground">{selectedSurface.label}</span> — 클릭 적용 · 호버 미리보기
            </>
          ) : (
            "레이어에서 표면을 선택하세요"
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" onMouseLeave={() => setHover(null)}>
        {visible.length === 0 && !loading && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            이 종류의 자재가 없습니다. 자재 라이브러리에서 등록하거나 seed.sql 을 적용하세요.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {visible.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              view="grid"
              selected={m.id === appliedId}
              onSelect={(mat) => {
                if (isTileKind(mat.kind)) applyTile(mat);
                else if (isObjectKind(mat.kind)) applyObject(mat);
              }}
              onHoverStart={(mat) => {
                onPreload?.(mat);
                // 호버 미리보기는 타일만 (도기는 클릭해야 배치된다)
                if (isTileKind(mat.kind)) setHover(mat.id);
              }}
              onHoverEnd={() => setHover(null)}
              className="cursor-pointer"
            />
          ))}
        </div>
        {loading && (
          <div className="flex justify-center p-3">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {hasMore && !loading && (
          <button type="button" onClick={loadMore} className="mt-2 w-full rounded-md border py-1.5 text-xs hover:bg-muted">
            더 보기
          </button>
        )}
      </div>
    </div>
  );
}
