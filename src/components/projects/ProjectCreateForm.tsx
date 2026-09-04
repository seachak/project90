"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { ImageDropzone } from "@/components/materials/ImageDropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useUser } from "@/hooks/use-user";
import { readImageSize } from "@/lib/image/loadImage";
import { extensionForMime, requestThumbnail, uploadWithProgress } from "@/lib/storage/upload";
import { createClient } from "@/lib/supabase/client";

interface Picked {
  file: File;
  url: string;
}

function usePicked(): [Picked | null, (f: File | null) => void] {
  const [picked, setPicked] = useState<Picked | null>(null);
  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);
  return [picked, (f) => setPicked(f ? { file: f, url: URL.createObjectURL(f) } : null)];
}

function PhotoField({
  label,
  hint,
  picked,
  onPick,
  required,
}: {
  label: string;
  hint: string;
  picked: Picked | null;
  onPick: (f: File | null) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label}
        {required && " *"}
      </Label>
      {picked ? (
        <div className="relative overflow-hidden rounded-xl border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={picked.url} alt="" className="max-h-72 w-full object-contain" />
          <Button size="icon-sm" variant="secondary" className="absolute top-2 right-2" onClick={() => onPick(null)} aria-label="사진 제거">
            <X className="size-4" />
          </Button>
          <p className="truncate px-3 py-1.5 text-xs text-muted-foreground">
            {picked.file.name} · {(picked.file.size / 1024 / 1024).toFixed(1)}MB
          </p>
        </div>
      ) : (
        <ImageDropzone multiple={false} onFiles={(files) => onPick(files[0] ?? null)} hint={hint} />
      )}
    </div>
  );
}

export function ProjectCreateForm() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [before, setBefore] = usePicked();
  const [after, setAfter] = usePicked();
  const [status, setStatus] = useState<"idle" | "creating" | "uploading" | "finishing">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busy = status !== "idle";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!user) {
      setError("로그인이 필요합니다.");
      return;
    }
    if (!before) {
      setError("시공 전 현장 사진을 올려 주세요.");
      return;
    }
    const supabase = createClient();
    try {
      setStatus("creating");
      const dims = await readImageSize(before.file);
      const { data: project, error: insertError } = await supabase
        .from("projects")
        .insert({
          name: name.trim() || "새 프로젝트",
          client_name: clientName.trim() || null,
          address: address.trim() || null,
          owner_id: user.id,
          width_px: dims.width,
          height_px: dims.height,
        })
        .select("id")
        .single();
      if (insertError || !project) throw insertError ?? new Error("프로젝트를 만들지 못했습니다.");

      setStatus("uploading");
      const beforePath = `${user.id}/${project.id}/before.${extensionForMime(before.file.type)}`;
      await uploadWithProgress({
        bucket: "projects",
        path: beforePath,
        file: before.file,
        upsert: true,
        onProgress: (f) => setProgress(after ? f * 0.7 : f),
      });
      let afterPath: string | null = null;
      if (after) {
        afterPath = `${user.id}/${project.id}/after.${extensionForMime(after.file.type)}`;
        await uploadWithProgress({
          bucket: "projects",
          path: afterPath,
          file: after.file,
          upsert: true,
          onProgress: (f) => setProgress(0.7 + f * 0.3),
        });
      }

      setStatus("finishing");
      let width = dims.width;
      let height = dims.height;
      try {
        const thumb = await requestThumbnail("projects", beforePath);
        if (thumb.width && thumb.height) {
          width = thumb.width;
          height = thumb.height;
        }
      } catch (err) {
        console.warn("thumbnail failed", err);
      }
      const { error: updateError } = await supabase
        .from("projects")
        .update({ before_url: beforePath, base_url: beforePath, after_url: afterPath, width_px: width, height_px: height })
        .eq("id", project.id);
      if (updateError) throw updateError;

      toast.success("프로젝트를 만들었습니다. 이제 벽과 바닥 영역을 지정하세요.");
      router.push(`/projects/${project.id}/mask`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "프로젝트 생성에 실패했습니다.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold">새 프로젝트</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          시공 전 현장 사진을 올리면 그 위에 자재를 입혀 볼 수 있습니다. 정면에서 바닥과 벽이 함께 보이는 사진이 가장 좋습니다.
        </p>
      </div>

      {!user && !loading && <p className="text-sm text-destructive">프로젝트를 만들려면 로그인이 필요합니다.</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-1">
          <Label htmlFor="name">프로젝트명 *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 반포 자이 101동 욕실" required disabled={busy} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client">고객명</Label>
          <Input id="client" value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={busy} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">주소</Label>
          <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={busy} />
        </div>
      </div>

      <PhotoField label="시공 전 사진 (BEFORE)" hint="JPG · PNG · WebP, 최대 4000×3000 권장" picked={before} onPick={setBefore} required />
      <PhotoField label="실제 시공 후 사진 (있으면)" hint="선택 사항 — 뷰어에 '실제 시공본' 탭이 추가됩니다" picked={after} onPick={setAfter} />

      {busy && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Progress value={Math.round(progress * 100)} className="flex-1" />
          {status === "creating" && "프로젝트 생성 중…"}
          {status === "uploading" && `사진 업로드 ${Math.round(progress * 100)}%`}
          {status === "finishing" && "썸네일 생성 중…"}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/projects")} disabled={busy}>
          취소
        </Button>
        <Button type="submit" disabled={busy || !user || !before}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
          프로젝트 만들기
        </Button>
      </div>
    </form>
  );
}
