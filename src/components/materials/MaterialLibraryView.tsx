"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, LayoutGrid, List, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { BulkImportDialog } from "@/components/materials/BulkImportDialog";
import { MaterialCard } from "@/components/materials/MaterialCard";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUser } from "@/hooks/use-user";
import { fetchMaterials } from "@/lib/materials/queries";
import { deleteLocalMaterial, isLocalMaterial, listLocalMaterials } from "@/lib/materials/localStore";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  ALL_KINDS,
  HUE_BUCKETS,
  KIND_LABELS,
  TILE_SIZE_PRESETS,
  type HueBucket,
  type Material,
  type MaterialKind,
} from "@/types/material";

type KindFilter = MaterialKind | "all";
type ViewMode = "grid" | "list";

const SIZE_ITEMS: Record<string, string> = {
  all: "전체 규격",
  ...Object.fromEntries(TILE_SIZE_PRESETS.map((p) => [`${p.w}x${p.h}`, `${p.w}×${p.h}${p.label ? ` (${p.label})` : ""}`])),
};

function parseSize(value: string): { w: number; h: number } | null {
  if (value === "all") return null;
  const [w, h] = value.split("x").map(Number);
  return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** 자재 라이브러리: 종류 탭 · 색상/규격 필터 · 검색 · 그리드/리스트 · 무한 스크롤 */
export function MaterialLibraryView() {
  const { user } = useUser();
  const [kind, setKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [hue, setHue] = useState<HueBucket | null>(null);
  const [size, setSize] = useState("all");
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");

  const [items, setItems] = useState<Material[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestId = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const sizeFilter = useMemo(() => parseSize(size), [size]);

  const load = useCallback(
    async (nextPage: number, reset: boolean) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        // Supabase 가 없으면 이 브라우저에 등록한 자재만 보여준다
        if (!hasSupabaseEnv()) {
          const all = await listLocalMaterials();
          if (id !== requestId.current) return;
          setItems(all);
          setHasMore(false);
          setPage(0);
          return;
        }
        const supabase = createClient();
        const result = await fetchMaterials(supabase, {
          kind,
          search: debouncedSearch,
          hue,
          size: sizeFilter,
          page: nextPage,
          ownerId: ownerOnly ? user?.id : null,
        });
        if (id !== requestId.current) return;
        setItems((prev) => (reset ? result.items : [...prev, ...result.items]));
        setHasMore(result.hasMore);
        setPage(nextPage);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : "자재를 불러오지 못했습니다.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [kind, debouncedSearch, hue, sizeFilter, ownerOnly, user?.id],
  );

  // 필터 변경 시 첫 페이지부터 다시
  useEffect(() => {
    void load(0, true);
  }, [load, refreshKey]);

  // 무한 스크롤
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) void load(page + 1, false);
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, load, page]);

  const showSizeFilter = kind === "all" || kind === "tile_floor" || kind === "tile_wall";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">자재 라이브러리</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline" }))}
            onClick={() => {
              if (!user) {
                toast.error("로그인 후 이용할 수 있습니다.");
                return;
              }
              setImportOpen(true);
            }}
          >
            <FileSpreadsheet className="size-4" data-icon="inline-start" />
            CSV/엑셀 일괄 등록
          </button>
          <Link href="/materials/new" className={cn(buttonVariants())}>
            <Plus className="size-4" data-icon="inline-start" />새 자재 등록
          </Link>
        </div>
      </div>

      <Tabs value={kind} onValueChange={(value) => setKind(value as KindFilter)}>
        <TabsList variant="line" className="h-auto flex-wrap">
          <TabsTrigger value="all">전체</TabsTrigger>
          {ALL_KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {KIND_LABELS[k]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 · 브랜드 · 모델코드 검색"
            className="pl-8"
            aria-label="자재 검색"
          />
          {search && (
            <button
              type="button"
              aria-label="검색어 지우기"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {showSizeFilter && (
          <Select items={SIZE_ITEMS} value={size} onValueChange={(v) => setSize((v as string | null) ?? "all")}>
            <SelectTrigger className="w-44" aria-label="규격 필터">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SIZE_ITEMS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-2">
          <Switch id="owner-only" checked={ownerOnly} onCheckedChange={(c) => setOwnerOnly(Boolean(c))} disabled={!user} />
          <Label htmlFor="owner-only" className="text-sm">
            내 자재만
          </Label>
        </div>

        <ToggleGroup
          value={[view]}
          onValueChange={(v) => {
            const next = (v as ViewMode[])[0];
            if (next) setView(next);
          }}
          variant="outline"
          spacing={0}
          aria-label="보기 방식"
        >
          <ToggleGroupItem value="grid" aria-label="그리드">
            <LayoutGrid className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="리스트">
            <List className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* 색상 팔레트 필터 */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="색상 필터">
        <button
          type="button"
          onClick={() => setHue(null)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            hue === null ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
          )}
        >
          모든 색
        </button>
        {HUE_BUCKETS.map((b) => (
          <button
            key={b.value}
            type="button"
            title={b.label}
            aria-label={b.label}
            aria-pressed={hue === b.value}
            onClick={() => setHue(hue === b.value ? null : b.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1.5 text-xs transition-colors",
              hue === b.value ? "border-foreground bg-muted" : "hover:bg-muted",
            )}
          >
            <span className="size-4 rounded-full border border-black/10" style={{ backgroundColor: b.swatch }} />
            {b.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>
      )}

      {items.length === 0 && !loading && !error && (
        <div className="rounded-xl border border-dashed p-16 text-center text-sm text-muted-foreground">
          조건에 맞는 자재가 없습니다.{" "}
          <Link href="/materials/new" className="underline underline-offset-4">
            새 자재를 등록
          </Link>
          하거나 <code>supabase/seed.sql</code> 로 샘플 타일을 넣어 보세요.
        </div>
      )}

      <div
        className={cn(
          view === "grid"
            ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            : "flex flex-col gap-2",
        )}
      >
        {items.map((m) => (
          <MaterialCard
            key={m.id}
            material={m}
            view={view}
            href={isLocalMaterial(m.id) ? undefined : `/materials/${m.id}`}
            onSelect={
              isLocalMaterial(m.id)
                ? (mat) => {
                    if (!confirm(`"${mat.name}" 을(를) 이 브라우저에서 삭제할까요?`)) return;
                    void deleteLocalMaterial(mat.id).then(() => setRefreshKey((k) => k + 1));
                  }
                : undefined
            }
          />
        ))}
        {loading &&
          Array.from({ length: items.length === 0 ? 12 : 6 }).map((_, i) => (
            <Skeleton key={`s-${i}`} className={view === "grid" ? "aspect-[4/5] rounded-xl" : "h-16 rounded-lg"} />
          ))}
      </div>

      <div ref={sentinelRef} className="flex h-10 items-center justify-center text-xs text-muted-foreground">
        {loading && items.length > 0 && <Loader2 className="size-4 animate-spin" />}
        {!hasMore && items.length > 0 && !loading && `${items.length}개 표시됨`}
      </div>

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(count) => {
          toast.success(`${count}개 자재를 등록했습니다.`);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
