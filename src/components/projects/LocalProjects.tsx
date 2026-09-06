"use client";

/**
 * Supabase 없이 쓰는 프로젝트 화면들 (목록 · 생성 · 마스킹 · 시뮬레이터).
 *
 * 서버 컴포넌트는 IndexedDB 를 읽을 수 없으므로, 로컬 모드에서는 각 라우트가
 * 여기 클라이언트 컴포넌트로 넘어온다. URL 은 Supabase 경로와 같게 유지한다.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, PencilRuler, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ImageDropzone } from "@/components/materials/ImageDropzone";
import { ThemeToggle } from "@/components/theme-toggle";
import { MaskEditor } from "@/components/canvas/MaskEditor";
import { Simulator } from "@/components/simulator/Simulator";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readImageSize } from "@/lib/image/loadImage";
import {
  createLocalProject,
  deleteLocalProject,
  getLocalProject,
  listLocalProjects,
  toSurfaceRow,
  type LocalProject,
} from "@/lib/projects/localStore";
import { listLocalMaterials } from "@/lib/materials/localStore";
import { toRenderSurface } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import type { Material } from "@/types/material";
import { toEditableSurface } from "@/types/surface";

/**
 * 로컬 모드용 헤더.
 * AppHeader 는 서버 컴포넌트(next/headers 로 세션을 읽음)라 클라이언트에서 쓸 수 없고,
 * 로컬 모드에는 로그인 개념이 없으므로 최소한의 내비게이션만 둔다.
 */
function LocalHeader() {
  return (
    <header className="flex h-14 items-center gap-4 border-b px-4">
      <Link href="/" className="flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">90</span>
        <span className="text-sm font-semibold">project90</span>
      </Link>
      <nav className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground">현장</Link>
        <Link href="/materials" className="hover:text-foreground">자재</Link>
      </nav>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}

/** 로컬 모드 공통 안내 배너 */
function LocalNotice({ className }: { className?: string }) {
  return (
    <p className={cn("rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300", className)}>
      로컬 모드 — Supabase 없이 <strong>이 브라우저에만</strong> 저장됩니다. 다른 기기에서는 보이지 않고,
      브라우저 사이트 데이터를 지우면 사라집니다.
    </p>
  );
}

// ---------------------------------------------------------------- 목록

export function LocalProjectList() {
  const [projects, setProjects] = useState<LocalProject[] | null>(null);

  const reload = () => void listLocalProjects().then(setProjects);
  useEffect(reload, []);

  return (
    <>
      <LocalHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">현장</h1>
          <Link href="/projects/new" className={cn(buttonVariants())}>
            <ImagePlus className="size-4" data-icon="inline-start" />새 현장
          </Link>
        </div>
        <LocalNotice />

        {projects === null ? (
          <div className="flex justify-center p-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            아직 현장이 없습니다. <Link href="/projects/new" className="underline underline-offset-4">사진을 올려</Link> 시작하세요.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-xl border">
                <Link href={`/projects/${p.id}`} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                </Link>
                <div className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      표면 {p.surfaces.length}개 · {new Date(p.updated_at).toLocaleDateString("ko-KR")}
                    </div>
                  </div>
                  <Link
                    href={`/projects/${p.id}/mask`}
                    className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
                    aria-label="표면 마스킹"
                  >
                    <PencilRuler className="size-4" />
                  </Link>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="삭제"
                    onClick={() => {
                      if (!confirm(`"${p.name}" 을(를) 삭제할까요?`)) return;
                      void deleteLocalProject(p.id).then(reload);
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

// ---------------------------------------------------------------- 생성

export function LocalProjectCreate() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const { width, height } = await readImageSize(file);
      const project = await createLocalProject({ name: name || file.name.replace(/\.[^.]+$/, ""), photo: file, width_px: width, height_px: height });
      toast.success("현장을 만들었습니다. 이제 벽·바닥을 지정하세요.");
      router.push(`/projects/${project.id}/mask`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "현장을 만들지 못했습니다.");
      setBusy(false);
    }
  };

  return (
    <>
      <LocalHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-8">
        <h1 className="text-xl font-semibold">새 현장</h1>
        <LocalNotice />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pname">현장 이름</Label>
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 반포 자이 101동 욕실" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>시공 전 사진 *</Label>
          <ImageDropzone onFiles={(files) => setFile(files[0] ?? null)} compact={Boolean(file)} />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="mt-2 w-full rounded-lg border object-contain" />
          )}
          <p className="text-xs text-muted-foreground">
            벽과 바닥이 잘 보이는 사진일수록 좋습니다. 원근이 뚜렷하면(모서리가 보이면) 타일이 더 자연스럽게 붙습니다.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={submit} disabled={!file || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            만들고 마스킹하기
          </Button>
          <Button variant="outline" onClick={() => router.push("/projects")} disabled={busy}>
            취소
          </Button>
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------- 마스킹 / 시뮬레이터

function useLocalProject(id: string) {
  const [state, setState] = useState<{ project: LocalProject | null; loading: boolean }>({ project: null, loading: true });
  useEffect(() => {
    let active = true;
    void getLocalProject(id).then((project) => {
      if (active) setState({ project, loading: false });
    });
    return () => {
      active = false;
    };
  }, [id]);
  return state;
}

function NotFound() {
  return (
    <>
      <LocalHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">현장을 찾을 수 없습니다</h1>
        <p className="text-sm text-muted-foreground">
          로컬 현장은 이 브라우저에만 저장됩니다. 다른 브라우저이거나 사이트 데이터를 지웠다면 사라집니다.
        </p>
        <Link href="/projects" className={cn(buttonVariants())}>
          현장 목록
        </Link>
      </main>
    </>
  );
}

function Loading() {
  return (
    <div className="flex h-svh items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function LocalMaskPage({ id }: { id: string }) {
  const { project, loading } = useLocalProject(id);
  if (loading) return <Loading />;
  if (!project) return <NotFound />;

  const initial = project.surfaces
    .map((row) => toEditableSurface(toSurfaceRow(project.id, row)))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <MaskEditor
      projectId={project.id}
      projectName={project.name}
      imageUrl={project.imageUrl}
      imageWidth={project.width_px}
      imageHeight={project.height_px}
      initialSurfaces={initial}
      mode="local"
    />
  );
}

export function LocalSimulatorPage({ id }: { id: string }) {
  const { project, loading } = useLocalProject(id);
  const [materials, setMaterials] = useState<Material[] | null>(null);

  useEffect(() => {
    void listLocalMaterials().then(setMaterials);
  }, []);

  if (loading || materials === null) return <Loading />;
  if (!project) return <NotFound />;

  const surfaces = project.surfaces
    .map((row) => toRenderSurface(toSurfaceRow(project.id, row)))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (surfaces.length === 0) {
    return (
      <>
        <LocalHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            아직 벽·바닥이 지정되지 않았습니다. 마스킹 에디터에서 영역과 원근 4점을 찍으면 시뮬레이터가 열립니다.
          </p>
          <Link href={`/projects/${project.id}/mask`} className={cn(buttonVariants())}>
            표면 마스킹 열기
          </Link>
        </main>
      </>
    );
  }

  return (
    <Simulator
      project={{ id: project.id, name: project.name, width_px: project.width_px, height_px: project.height_px, imageUrl: project.imageUrl }}
      surfaces={surfaces}
      materials={materials}
      tilePlacements={project.tilePlacements}
      objectPlacements={project.objectPlacements}
      sceneSettings={project.scene}
      staticMaterials={materials}
      mode="local"
    />
  );
}
