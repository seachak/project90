"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Eraser,
  Loader2,
  RefreshCw,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { AnchorPicker, type AnchorPoint } from "@/components/materials/AnchorPicker";
import { EraserCanvas } from "@/components/materials/EraserCanvas";
import { ImageDropzone } from "@/components/materials/ImageDropzone";
import { TagInput } from "@/components/materials/TagInput";
import { TilePreview } from "@/components/materials/TilePreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUser } from "@/hooks/use-user";
import { hasSupabaseEnv, isGuestMaterialsEnabled } from "@/lib/env";
import { saveLocalMaterial } from "@/lib/materials/localStore";
import { canvasToBlob, canvasToImageData, drawToCanvas, loadImage, rasterToBlob } from "@/lib/image/loadImage";
import { dominantColorHex, hueBucketOf, type RasterLike } from "@/lib/image/palette";
import { removeImageBackground } from "@/lib/image/removeBg";
import { fetchTagSuggestions } from "@/lib/materials/queries";
import { applySeamFix, measureSeam, type SeamFix, type SeamReport } from "@/lib/render/seamless";
import {
  extensionForMime,
  requestThumbnail,
  storagePathFor,
  uploadWithProgress,
} from "@/lib/storage/upload";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  ALL_KINDS,
  DEFAULT_MOUNT_BY_KIND,
  FINISH_GLOSS,
  FINISH_OPTIONS,
  KIND_LABELS,
  MOUNT_OPTIONS,
  TILE_SIZE_PRESETS,
  isObjectKind,
  isTileKind,
  type Finish,
  type MaterialInsert,
  type MaterialKind,
  type MaterialMeta,
  type MountType,
} from "@/types/material";

type DraftStatus = "processing" | "ready" | "uploading" | "saving" | "saved" | "error";

interface Draft {
  id: string;
  file: File;
  fileUrl: string;
  processedBlob: Blob | null;
  processedUrl: string | null;
  sourceWidth: number;
  sourceHeight: number;
  baseColor: string | null;
  // 타일
  fullRaster: RasterLike | null;
  seam: SeamReport | null;
  seamFix: SeamFix;
  // 위생도기
  bgProgress: number;
  bgStage: string;
  bgFailed: boolean;
  anchor: AnchorPoint | null;
  // 개별 필드
  name: string;
  model_code: string;
  price: string;
  real_width_mm: string;
  real_height_mm: string;
  real_depth_mm: string;
  // 상태
  status: DraftStatus;
  progress: number;
  error: string | null;
}

interface SharedFields {
  kind: MaterialKind;
  brand: string;
  tags: string[];
  is_public: boolean;
  tile_width_mm: string;
  tile_height_mm: string;
  grout_color: string;
  grout_width_mm: string;
  finish: Finish;
  random_rotate: boolean;
  mount_type: MountType;
}

const INITIAL_SHARED: SharedFields = {
  kind: "tile_floor",
  brand: "",
  tags: [],
  is_public: false,
  tile_width_mm: "600",
  tile_height_mm: "600",
  grout_color: "#d8d5d0",
  grout_width_mm: "3",
  finish: "matte",
  random_rotate: false,
  mount_type: "floor",
};

function num(value: string): number | null {
  const n = Number(value);
  return value.trim() === "" || !Number.isFinite(n) ? null : n;
}

function baseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

/** 알파 바운딩 박스의 하단 중앙 → 기본 접지점 */
function defaultAnchor(raster: RasterLike): AnchorPoint {
  const { width, height, data } = raster;
  let minX = width;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0.5, y: 0.98 };
  return { x: (minX + maxX) / 2 / width, y: Math.min(0.995, (maxY + 0.5) / height) };
}

/**
 * 이음매 보정(거울/오프셋)에 쓰는 작업용 래스터의 한 변 최대 픽셀.
 * 보정을 켜면 이 래스터가 곧 업로드되는 텍스처가 되므로, 실물 사진의 결을 잃지 않을 만큼 커야 한다.
 * (거울 보정은 2배로 커지므로 결과는 최대 4800px)
 */
const TILE_WORK_RASTER = 2400;

async function analyzeTile(file: File) {
  const img = await loadImage(file);
  const full = canvasToImageData(drawToCanvas(img, TILE_WORK_RASTER));
  const small = canvasToImageData(drawToCanvas(img, 400));
  return {
    fullRaster: full as RasterLike,
    seam: measureSeam(small),
    baseColor: dominantColorHex(small, { k: 4 }),
    sourceWidth: img.naturalWidth,
    sourceHeight: img.naturalHeight,
  };
}

async function analyzeCutout(blob: Blob) {
  const img = await loadImage(blob);
  const small = canvasToImageData(drawToCanvas(img, 400));
  return {
    anchor: defaultAnchor(small),
    baseColor: dominantColorHex(small, { k: 4, alphaThreshold: 128 }),
    sourceWidth: img.naturalWidth,
    sourceHeight: img.naturalHeight,
  };
}

interface MaterialFormProps {
  initialKind?: MaterialKind;
}

/**
 * 자재 등록 폼 — 종류에 따라 타일/위생도기 분기.
 * 여러 이미지를 한 번에 올리면 이미지마다 초안이 생기고, 공통 정보는 한 번만 입력한다.
 */
export function MaterialForm({ initialKind = "tile_floor" }: MaterialFormProps) {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const guestMode = isGuestMaterialsEnabled() && hasSupabaseEnv();
  /**
   * 로그인하지 않았으면 이 브라우저(IndexedDB)에 저장한다.
   * 환경변수 유무가 아니라 "지금 저장할 계정이 있는가"로 판단해야 한다 —
   * Supabase 가 설정돼 있어도 로그인 전이면 저장 경로가 막혀 막다른 길이 된다.
   */
  const localMode = !userLoading && !user && !guestMode;
  const [shared, setShared] = useState<SharedFields>({ ...INITIAL_SHARED, kind: initialKind });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [eraserOpen, setEraserOpen] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const abortRef = useRef(new Map<string, AbortController>());

  const tile = isTileKind(shared.kind);
  const active = drafts.find((d) => d.id === activeId) ?? drafts[0] ?? null;

  useEffect(() => {
    try {
      fetchTagSuggestions(createClient())
        .then(setTagSuggestions)
        .catch(() => undefined);
    } catch {
      // 환경변수 미설정 등 — 자동완성 없이 진행
    }
  }, []);

  // 언마운트 시 object URL 정리
  useEffect(
    () => () => {
      for (const d of draftsRef.current) {
        URL.revokeObjectURL(d.fileUrl);
        if (d.processedUrl) URL.revokeObjectURL(d.processedUrl);
      }
    },
    [],
  );

  const patch = useCallback((id: string, changes: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...(typeof changes === "function" ? changes(d) : changes) } : d)),
    );
  }, []);

  const setProcessed = useCallback(
    (id: string, blob: Blob | null) => {
      patch(id, (d) => {
        if (d.processedUrl) URL.revokeObjectURL(d.processedUrl);
        return { processedBlob: blob, processedUrl: blob ? URL.createObjectURL(blob) : null };
      });
    },
    [patch],
  );

  /** 종류(타일/위생도기)에 맞춰 이미지 분석·처리 */
  const processDraft = useCallback(
    async (draft: Draft, kind: MaterialKind) => {
      const id = draft.id;
      patch(id, { status: "processing", error: null, bgFailed: false, bgProgress: 0 });
      try {
        if (isTileKind(kind)) {
          const info = await analyzeTile(draft.file);
          setProcessed(id, null);
          patch(id, { ...info, seamFix: "none", anchor: null, status: "ready" });
        } else {
          abortRef.current.get(id)?.abort();
          const controller = new AbortController();
          abortRef.current.set(id, controller);
          let cutout: Blob;
          try {
            cutout = await removeImageBackground(
              draft.file,
              (p) => patch(id, { bgProgress: p.fraction, bgStage: p.stage }),
              controller.signal,
            );
          } catch (err) {
            if (controller.signal.aborted) return;
            console.warn("background removal failed", err);
            // 실패 시 원본을 그대로 쓰고 수동 지우개로 다듬게 한다
            cutout = draft.file;
            patch(id, { bgFailed: true });
          }
          if (controller.signal.aborted) return;
          const info = await analyzeCutout(cutout);
          setProcessed(id, cutout);
          patch(id, { ...info, fullRaster: null, seam: null, status: "ready" });
        }
      } catch (err) {
        patch(id, { status: "error", error: err instanceof Error ? err.message : "이미지 처리 실패" });
      }
    },
    [patch, setProcessed],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const created: Draft[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        fileUrl: URL.createObjectURL(file),
        processedBlob: null,
        processedUrl: null,
        sourceWidth: 0,
        sourceHeight: 0,
        baseColor: null,
        fullRaster: null,
        seam: null,
        seamFix: "none",
        bgProgress: 0,
        bgStage: "",
        bgFailed: false,
        anchor: null,
        name: baseName(file),
        model_code: "",
        price: "",
        real_width_mm: "",
        real_height_mm: "",
        real_depth_mm: "",
        status: "processing",
        progress: 0,
        error: null,
      }));
      setDrafts((prev) => [...prev, ...created]);
      setActiveId((prev) => prev ?? created[0]?.id ?? null);
      // 순차 처리 (배경 제거는 무거우므로 동시에 여러 개 돌리지 않는다)
      void (async () => {
        for (const d of created) await processDraft(d, shared.kind);
      })();
    },
    [processDraft, shared.kind],
  );

  const removeDraft = (id: string) => {
    abortRef.current.get(id)?.abort();
    setDrafts((prev) => {
      const target = prev.find((d) => d.id === id);
      if (target) {
        URL.revokeObjectURL(target.fileUrl);
        if (target.processedUrl) URL.revokeObjectURL(target.processedUrl);
      }
      return prev.filter((d) => d.id !== id);
    });
    if (activeId === id) setActiveId(null);
  };

  const changeKind = (kind: MaterialKind) => {
    const groupChanged = isTileKind(kind) !== isTileKind(shared.kind);
    setShared((s) => ({
      ...s,
      kind,
      mount_type: isObjectKind(kind) ? DEFAULT_MOUNT_BY_KIND[kind] : s.mount_type,
    }));
    if (groupChanged) {
      void (async () => {
        for (const d of draftsRef.current) await processDraft(d, kind);
      })();
    }
  };

  const changeSeamFix = async (draft: Draft, fix: SeamFix) => {
    patch(draft.id, { seamFix: fix });
    if (!draft.fullRaster) return;
    if (fix === "none") {
      setProcessed(draft.id, null);
      return;
    }
    patch(draft.id, { status: "processing" });
    const fixed = applySeamFix(draft.fullRaster, fix);
    // 보정본이 그대로 업로드되므로 압축을 세게 걸면 텍스처가 뭉개진다
    const blob = await rasterToBlob(fixed, "image/webp", 0.96);
    setProcessed(draft.id, blob);
    patch(draft.id, { status: "ready" });
  };

  const applyTileSize = (w: number, h: number) =>
    setShared((s) => ({ ...s, tile_width_mm: String(w), tile_height_mm: String(h) }));

  const validate = (draft: Draft): string | null => {
    if (!draft.name.trim()) return "이름을 입력하세요.";
    if (tile) {
      if (!num(shared.tile_width_mm) || !num(shared.tile_height_mm)) return "타일 규격(mm)을 입력하세요.";
    } else if (!num(draft.real_width_mm) || !num(draft.real_height_mm)) {
      return "실제 치수(폭·높이 mm)를 입력하세요. 원근 스케일 계산에 필요합니다.";
    }
    if (draft.status === "processing") return "이미지 처리가 끝날 때까지 기다려 주세요.";
    return null;
  };

  const saveDraft = async (draft: Draft): Promise<boolean> => {
    const problem = validate(draft);
    if (problem) {
      patch(draft.id, { status: "error", error: problem });
      return false;
    }
    const blob = draft.processedBlob ?? draft.file;
    const mime = blob.type || draft.file.type || "image/png";
    const bucket = tile ? "textures" : "cutouts";
    try {
      const finish = shared.finish;
      const meta: MaterialMeta = {
        hue_bucket: draft.baseColor ? (hueBucketOf(draft.baseColor) ?? undefined) : undefined,
        seam_fix: tile ? draft.seamFix : undefined,
        seam_score: tile && draft.seam ? Number(draft.seam.score.toFixed(2)) : undefined,
        random_rotate: tile ? shared.random_rotate : undefined,
        source_width: draft.sourceWidth,
        source_height: draft.sourceHeight,
      };
      const insert: MaterialInsert = {
        kind: shared.kind,
        name: draft.name.trim(),
        brand: shared.brand.trim() || null,
        model_code: draft.model_code.trim() || null,
        texture_url: null,
        cutout_url: null,
        thumbnail_url: null,
        tile_width_mm: tile ? num(shared.tile_width_mm) : null,
        tile_height_mm: tile ? num(shared.tile_height_mm) : null,
        is_seamless: tile ? draft.seamFix !== "none" || (draft.seam?.isSeamless ?? true) : null,
        grout_color: tile ? shared.grout_color : undefined,
        grout_width_mm: tile ? (num(shared.grout_width_mm) ?? 3) : undefined,
        anchor_x: tile ? null : (draft.anchor?.x ?? null),
        anchor_y: tile ? null : (draft.anchor?.y ?? null),
        real_width_mm: tile ? null : num(draft.real_width_mm),
        real_height_mm: tile ? null : num(draft.real_height_mm),
        real_depth_mm: tile ? null : num(draft.real_depth_mm),
        mount_type: tile ? null : shared.mount_type,
        finish,
        gloss: FINISH_GLOSS[finish],
        base_color: draft.baseColor,
        price: num(draft.price),
        tags: shared.tags,
        meta: JSON.parse(JSON.stringify(meta)),
        owner_id: user?.id ?? null,
        is_public: shared.is_public,
      };

      if (localMode) {
        // Supabase 가 없다 — 이미지와 메타를 이 브라우저의 IndexedDB 에 넣는다.
        // 썸네일도 서버(sharp) 대신 캔버스로 만든다.
        patch(draft.id, { status: "saving", progress: 0.5, error: null });
        let thumb: Blob | null = null;
        try {
          const img = await loadImage(blob);
          thumb = await canvasToBlob(drawToCanvas(img, 400), "image/webp", 0.9);
        } catch (err) {
          console.warn("로컬 썸네일 생성 실패, 원본을 그대로 씁니다", err);
        }
        await saveLocalMaterial({ insert, blob, thumb });
        patch(draft.id, { status: "saved", progress: 1, fullRaster: null });
        return true;
      }

      if (!user) {
        // 게스트 모드: 브라우저에서 Storage 에 직접 못 쓰므로(RLS) 서버 라우트가 대신 처리한다
        patch(draft.id, { status: "uploading", progress: 0.1, error: null });
        const form = new FormData();
        form.append("file", new File([blob], `material.${extensionForMime(mime)}`, { type: mime }));
        form.append("payload", JSON.stringify({ ...insert, __bucket: bucket }));
        patch(draft.id, { status: "saving", progress: 0.6 });
        const res = await fetch("/api/materials/guest", { method: "POST", body: form });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? "게스트 등록에 실패했습니다.");
        patch(draft.id, { status: "saved", progress: 1, fullRaster: null });
        return true;
      }

      const supabase = createClient();
      const path = storagePathFor(user.id, extensionForMime(mime));
      patch(draft.id, { status: "uploading", progress: 0, error: null });
      const { publicUrl } = await uploadWithProgress({
        bucket,
        path,
        file: blob,
        contentType: mime,
        onProgress: (f) => patch(draft.id, { progress: f }),
      });
      patch(draft.id, { status: "saving" });
      let thumbnailUrl = publicUrl;
      try {
        thumbnailUrl = (await requestThumbnail(bucket, path)).thumbnailUrl;
      } catch (err) {
        console.warn("thumbnail failed, falling back to original", err);
      }
      insert.texture_url = tile ? publicUrl : null;
      insert.cutout_url = tile ? null : publicUrl;
      insert.thumbnail_url = thumbnailUrl;

      const { error } = await supabase.from("materials").insert(insert);
      if (error) throw error;
      patch(draft.id, { status: "saved", progress: 1, fullRaster: null });
      return true;
    } catch (err) {
      patch(draft.id, { status: "error", error: err instanceof Error ? err.message : "저장 실패" });
      return false;
    }
  };

  const saveAll = async () => {
    setSavingAll(true);
    let ok = 0;
    for (const d of draftsRef.current) {
      if (d.status === "saved") continue;
      if (await saveDraft(d)) ok++;
    }
    setSavingAll(false);
    const remaining = draftsRef.current.filter((d) => d.status !== "saved").length;
    if (ok > 0) toast.success(`${ok}개 자재를 등록했습니다.`);
    if (remaining === 0 && ok > 0) router.push("/materials");
  };

  const pendingCount = drafts.filter((d) => d.status !== "saved").length;
  const kindItems = useMemo(() => ALL_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })), []);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ---------- 좌측: 종류 · 이미지 · 미리보기 ---------- */}
      <section className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold">새 자재 등록</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            종류를 고르고 이미지를 올리면 자동으로 분석합니다. 타일은 이음매 검사와 3×3 미리보기,
            위생도기는 배경 제거와 접지점 지정을 지원합니다.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>종류</Label>
          <ToggleGroup
            value={[shared.kind]}
            onValueChange={(v) => {
              const next = (v as MaterialKind[])[0];
              if (next) changeKind(next);
            }}
            variant="outline"
            spacing={0}
            className="flex-wrap"
          >
            {kindItems.map((k) => (
              <ToggleGroupItem key={k.value} value={k.value}>
                {k.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <ImageDropzone onFiles={addFiles} compact={drafts.length > 0} />
        {localMode && (
          <p className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-700 dark:text-sky-300">
            로그인하지 않아 <strong>이 브라우저에만</strong> 저장됩니다. 등록하면 시뮬레이터 자재 목록에 바로
            나타납니다. 다른 기기에서는 보이지 않고, 브라우저 사이트 데이터를 지우면 사라집니다.
            {hasSupabaseEnv() && (
              <>
                {" "}
                <Link href="/login" className="font-medium underline underline-offset-2">
                  로그인
                </Link>
                하면 계정에 저장돼 어느 기기에서나 보입니다.
              </>
            )}
          </p>
        )}
        {guestMode && !user && !userLoading && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            게스트 모드 — 로그인 없이 서버에 등록됩니다. 등록한 자재는 <strong>공개 자재</strong>로 저장되며 소유자가 없어
            나중에 로그인해도 &ldquo;내 자재&rdquo;로 잡히지 않습니다. 임시 확인용으로만 쓰세요.
          </p>
        )}

        {drafts.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {drafts.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveId(d.id)}
                className={cn(
                  "relative size-16 overflow-hidden rounded-lg border bg-muted",
                  active?.id === d.id && "ring-2 ring-primary",
                )}
                title={d.name || `이미지 ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.processedUrl ?? d.fileUrl} alt="" className="size-full object-cover" />
                {d.status === "saved" && (
                  <CheckCircle2 className="absolute right-0.5 bottom-0.5 size-4 rounded-full bg-background text-green-600" />
                )}
                {(d.status === "processing" || d.status === "uploading" || d.status === "saving") && (
                  <Loader2 className="absolute right-0.5 bottom-0.5 size-4 animate-spin rounded-full bg-background" />
                )}
              </button>
            ))}
          </div>
        )}

        {active && (
          <div className="flex flex-col gap-4 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{active.name || active.file.name}</span>
                {active.sourceWidth > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {active.sourceWidth}×{active.sourceHeight}px
                  </span>
                )}
                {active.status === "processing" && (
                  <Badge variant="secondary">
                    <Loader2 className="size-3 animate-spin" />
                    {tile ? "분석 중" : active.bgStage.startsWith("fetch") ? `모델 받는 중 ${Math.round(active.bgProgress * 100)}%` : `배경 제거 중 ${Math.round(active.bgProgress * 100)}%`}
                  </Badge>
                )}
                {active.status === "saved" && (
                  <Badge className="bg-green-600 text-white">
                    <CheckCircle2 className="size-3" />
                    저장됨
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeDraft(active.id)} disabled={active.status === "uploading" || active.status === "saving"}>
                <Trash2 className="size-4" />
                제거
              </Button>
            </div>

            {tile ? (
              <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                <TilePreview
                  src={active.processedUrl ?? active.fileUrl}
                  tileWidthMm={num(shared.tile_width_mm) ?? 600}
                  tileHeightMm={num(shared.tile_height_mm) ?? 600}
                  groutWidthMm={num(shared.grout_width_mm) ?? 3}
                  groutColor={shared.grout_color}
                  randomRotate={shared.random_rotate}
                />
                <div className="flex flex-col gap-3 text-sm">
                  <div>
                    <p className="mb-1 font-medium">이음매 검사</p>
                    {active.seam ? (
                      active.seam.isSeamless || active.seamFix !== "none" ? (
                        <Badge className="bg-green-600 text-white">
                          <CheckCircle2 className="size-3" />
                          이음매 없음
                          {active.seamFix !== "none" && " (보정 적용)"}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertTriangle className="size-3" />
                          이음매 있음 (점수 {active.seam.score.toFixed(1)})
                        </Badge>
                      )
                    ) : (
                      <span className="text-muted-foreground">분석 중…</span>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      가장자리 픽셀 차이 ÷ 내부 인접 픽셀 차이. 2.5 이하면 이음매 없음으로 봅니다.
                      타일 1장 사진이라면 줄눈으로 구분되므로 그대로 써도 됩니다.
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 font-medium">이음매 보정</p>
                    <ToggleGroup
                      value={[active.seamFix]}
                      onValueChange={(v) => {
                        const next = (v as SeamFix[])[0];
                        if (next) void changeSeamFix(active, next);
                      }}
                      variant="outline"
                      size="sm"
                      spacing={0}
                    >
                      <ToggleGroupItem value="none">원본 유지</ToggleGroupItem>
                      <ToggleGroupItem value="mirror">거울 반복</ToggleGroupItem>
                      <ToggleGroupItem value="offset">오프셋 블렌드</ToggleGroupItem>
                    </ToggleGroup>
                    <p className="mt-1 text-xs text-muted-foreground">
                      거울 반복은 크기가 2배가 되지만 항상 이음매가 없고, 오프셋 블렌드는 크기를 유지합니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="random-rotate"
                      checked={shared.random_rotate}
                      onCheckedChange={(c) => setShared((s) => ({ ...s, random_rotate: Boolean(c) }))}
                    />
                    <Label htmlFor="random-rotate">랜덤 90° 회전 (대리석·우드 반복 티 방지)</Label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {active.bgFailed && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    자동 배경 제거에 실패해 원본을 그대로 사용합니다. 수동 지우개로 배경을 지워 주세요.
                  </p>
                )}
                {active.processedUrl ? (
                  <AnchorPicker
                    src={active.processedUrl}
                    anchor={active.anchor}
                    onChange={(anchor) => patch(active.id, { anchor })}
                    label={shared.mount_type === "wall" ? "벽에 닿는 지점" : "바닥에 닿는 지점"}
                  />
                ) : (
                  <div className="flex h-60 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                    {active.bgStage.startsWith("fetch")
                      ? `배경 제거 모델을 내려받는 중 (${Math.round(active.bgProgress * 100)}%) — 최초 1회`
                      : `배경 제거 중 ${Math.round(active.bgProgress * 100)}%`}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEraserOpen(true)} disabled={!active.processedBlob}>
                    <Eraser className="size-4" />
                    수동 지우개
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void processDraft(active, shared.kind)} disabled={active.status === "processing"}>
                    <RefreshCw className="size-4" />
                    배경 제거 다시 실행
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      setProcessed(active.id, active.file);
                      const info = await analyzeCutout(active.file);
                      patch(active.id, { ...info, bgFailed: false, status: "ready" });
                    }}
                  >
                    <Wand2 className="size-4" />
                    원본 그대로 사용
                  </Button>
                </div>
              </div>
            )}

            {(active.status === "uploading" || active.status === "saving") && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Progress value={Math.round(active.progress * 100)} className="flex-1" />
                {active.status === "uploading" ? `업로드 ${Math.round(active.progress * 100)}%` : "저장 중…"}
              </div>
            )}
            {active.error && <p className="text-sm text-destructive">{active.error}</p>}
          </div>
        )}
      </section>

      {/* ---------- 우측: 입력 필드 ---------- */}
      <aside className="flex flex-col gap-5 lg:sticky lg:top-16 lg:self-start">
        <div className="flex flex-col gap-4 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">
            {active ? `이 자재 정보${drafts.length > 1 ? ` (${drafts.indexOf(active) + 1}/${drafts.length})` : ""}` : "자재 정보"}
          </h2>
          <Field label="이름 *" id="name">
            <Input
              id="name"
              value={active?.name ?? ""}
              onChange={(e) => active && patch(active.id, { name: e.target.value })}
              placeholder="예: 카라라 마블 600각"
              disabled={!active}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="모델코드" id="model">
              <Input
                id="model"
                value={active?.model_code ?? ""}
                onChange={(e) => active && patch(active.id, { model_code: e.target.value })}
                disabled={!active}
              />
            </Field>
            <Field label="가격 (원)" id="price">
              <Input
                id="price"
                type="number"
                inputMode="numeric"
                min={0}
                value={active?.price ?? ""}
                onChange={(e) => active && patch(active.id, { price: e.target.value })}
                disabled={!active}
              />
            </Field>
          </div>

          {!tile && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Field label="실제 폭 W (mm) *" id="rw">
                  <Input id="rw" type="number" inputMode="numeric" min={1} value={active?.real_width_mm ?? ""} onChange={(e) => active && patch(active.id, { real_width_mm: e.target.value })} disabled={!active} />
                </Field>
                <Field label="높이 H (mm) *" id="rh">
                  <Input id="rh" type="number" inputMode="numeric" min={1} value={active?.real_height_mm ?? ""} onChange={(e) => active && patch(active.id, { real_height_mm: e.target.value })} disabled={!active} />
                </Field>
                <Field label="깊이 D (mm)" id="rd">
                  <Input id="rd" type="number" inputMode="numeric" min={1} value={active?.real_depth_mm ?? ""} onChange={(e) => active && patch(active.id, { real_depth_mm: e.target.value })} disabled={!active} />
                </Field>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                실제 치수가 있어야 사진 속 위치에 따라 크기가 자동으로 맞춰집니다.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">공통 정보 {drafts.length > 1 && "(모든 이미지에 적용)"}</h2>

          {tile && (
            <>
              <div className="flex flex-col gap-2">
                <Label>타일 규격 (가로×세로 mm) *</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TILE_SIZE_PRESETS.map((p) => {
                    const on = shared.tile_width_mm === String(p.w) && shared.tile_height_mm === String(p.h);
                    return (
                      <button
                        key={`${p.w}x${p.h}`}
                        type="button"
                        onClick={() => applyTileSize(p.w, p.h)}
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs",
                          on ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                        )}
                      >
                        {p.w}×{p.h}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" inputMode="numeric" min={1} aria-label="타일 가로 mm" value={shared.tile_width_mm} onChange={(e) => setShared((s) => ({ ...s, tile_width_mm: e.target.value }))} />
                  <Input type="number" inputMode="numeric" min={1} aria-label="타일 세로 mm" value={shared.tile_height_mm} onChange={(e) => setShared((s) => ({ ...s, tile_height_mm: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="줄눈 색" id="grout-color">
                  <div className="flex items-center gap-2">
                    <input
                      id="grout-color"
                      type="color"
                      value={shared.grout_color}
                      onChange={(e) => setShared((s) => ({ ...s, grout_color: e.target.value }))}
                      className="size-8 cursor-pointer rounded-md border bg-transparent p-0.5"
                    />
                    <Input
                      value={shared.grout_color}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9a-f]{0,6}$/i.test(v)) setShared((s) => ({ ...s, grout_color: v }));
                      }}
                      onBlur={(e) => {
                        if (!/^#[0-9a-f]{6}$/i.test(e.target.value)) setShared((s) => ({ ...s, grout_color: INITIAL_SHARED.grout_color }));
                      }}
                      className="font-mono"
                      aria-label="줄눈 색 HEX"
                    />
                  </div>
                </Field>
                <Field label="줄눈 두께 (mm)" id="grout-width">
                  <Input id="grout-width" type="number" inputMode="decimal" min={0} step={0.5} value={shared.grout_width_mm} onChange={(e) => setShared((s) => ({ ...s, grout_width_mm: e.target.value }))} />
                </Field>
              </div>
            </>
          )}

          {!tile && (
            <div className="flex flex-col gap-2">
              <Label>설치 방식</Label>
              <ToggleGroup
                value={[shared.mount_type]}
                onValueChange={(v) => {
                  const next = (v as MountType[])[0];
                  if (next) setShared((s) => ({ ...s, mount_type: next }));
                }}
                variant="outline"
                size="sm"
                spacing={0}
              >
                {MOUNT_OPTIONS.map((m) => (
                  <ToggleGroupItem key={m.value} value={m.value}>
                    {m.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>마감</Label>
            <ToggleGroup
              value={[shared.finish]}
              onValueChange={(v) => {
                const next = (v as Finish[])[0];
                if (next) setShared((s) => ({ ...s, finish: next }));
              }}
              variant="outline"
              size="sm"
              spacing={0}
            >
              {FINISH_OPTIONS.map((f) => (
                <ToggleGroupItem key={f.value} value={f.value}>
                  {f.label}
                  <span className="text-[10px] text-muted-foreground">{f.gloss}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <Field label="브랜드" id="brand">
            <Input id="brand" value={shared.brand} onChange={(e) => setShared((s) => ({ ...s, brand: e.target.value }))} placeholder="예: 대림, 아메리칸스탠다드" />
          </Field>
          <Field label="태그" id="tags">
            <TagInput id="tags" value={shared.tags} onChange={(tags) => setShared((s) => ({ ...s, tags }))} suggestions={tagSuggestions} />
          </Field>
          <div className="flex items-center gap-2">
            <Switch id="is-public" checked={shared.is_public} onCheckedChange={(c) => setShared((s) => ({ ...s, is_public: Boolean(c) }))} />
            <Label htmlFor="is-public">공개 자재 (다른 사용자도 볼 수 있음)</Label>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {drafts.length > 1 && (
            <Button size="lg" onClick={saveAll} disabled={savingAll || pendingCount === 0}>
              {savingAll && <Loader2 className="size-4 animate-spin" />}
              {localMode ? "이 브라우저에 모두 저장" : "모두 저장"} ({pendingCount}개)
            </Button>
          )}
          <Button
            size="lg"
            variant={drafts.length > 1 ? "outline" : "default"}
            onClick={async () => {
              if (!active) return;
              const ok = await saveDraft(active);
              if (ok) {
                toast.success("자재를 등록했습니다.");
                if (drafts.length === 1) router.push("/materials");
              }
            }}
            disabled={!active || active.status === "saved" || active.status === "uploading" || active.status === "saving" || savingAll}
          >
            {active && (active.status === "uploading" || active.status === "saving") && <Loader2 className="size-4 animate-spin" />}
            {drafts.length > 1 ? "이 자재만 저장" : localMode ? "이 브라우저에 저장" : "저장"}
          </Button>
        </div>
      </aside>

      <Dialog open={eraserOpen} onOpenChange={setEraserOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>수동 지우개</DialogTitle>
          </DialogHeader>
          {active?.processedBlob && (
            <EraserCanvas
              cutout={active.processedBlob}
              original={active.file}
              onCancel={() => setEraserOpen(false)}
              onApply={async (blob) => {
                setProcessed(active.id, blob);
                const info = await analyzeCutout(blob);
                patch(active.id, { baseColor: info.baseColor, anchor: active.anchor ?? info.anchor, bgFailed: false });
                setEraserOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
