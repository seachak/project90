import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-bold tracking-tight text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">페이지를 찾을 수 없습니다</h1>
      <p className="text-sm text-muted-foreground">주소가 잘못되었거나 삭제된 페이지입니다.</p>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
        홈으로
      </Link>
    </main>
  );
}
