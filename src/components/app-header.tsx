import Link from "next/link";
import { LayoutGrid, Layers } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

async function getUserEmail(): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

/** 목록 화면 공통 헤더 (시뮬레이터 화면은 자체 헤더를 사용) */
export async function AppHeader() {
  const email = await getUserEmail();

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
          90
        </span>
        project90
      </Link>

      <nav className="ml-2 flex items-center gap-1 text-sm">
        <Link
          href="/projects"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LayoutGrid className="size-4" />
          프로젝트
        </Link>
        <Link
          href="/materials"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Layers className="size-4" />
          자재
        </Link>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        {email ? (
          <>
            <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:inline">
              {email}
            </span>
            <form action="/auth/signout" method="post">
              <Button variant="outline" size="sm" type="submit">
                로그아웃
              </Button>
            </form>
          </>
        ) : (
          <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
            로그인
          </Link>
        )}
      </div>
    </header>
  );
}
