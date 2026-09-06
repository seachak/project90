"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { MaterialCard } from "@/components/materials/MaterialCard";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchMaterials } from "@/lib/materials/queries";
import { createClient } from "@/lib/supabase/client";
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

  // 선택한 표면 종류에 맞춰 탭 자동 전환
  useEffect(() => {
    if (!selectedSurface) return;
    setKind(selectedSurface.surface_type === "wall" ? "tile_wall" : "tile_floor");
  }, [selectedSurface?.id, selectedSurface?.surface_type]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (staticMaterials) return;
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
    if (staticMaterials || loading || !hasMore) return;
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
    if (!staticMaterials) return items;
    const q = search.trim().toLowerCase();
    return staticMaterials.filter((m) => m.kind === kind && (!q || m.name.toLowerCase().includes(q) || (m.brand ?? "").toLowerCase().includes(q)));
  }, [staticMaterials, items, kind, search]);

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
        <p className="mt-2 truncate text-[11px] text-muted-foreground">
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
