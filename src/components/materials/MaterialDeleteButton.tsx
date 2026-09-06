"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

export function MaterialDeleteButton({ id, name, guest = false }: { id: string; name: string; guest?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    // 게스트 자재는 소유자가 없어 RLS 로는 지울 수 없다 — 서버 라우트가 대신 지운다
    if (guest) {
      const res = await fetch(`/api/materials/guest?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string };
      setBusy(false);
      if (!res.ok) {
        toast.error(body.error ?? "삭제 실패");
        return;
      }
      toast.success("자재를 삭제했습니다.");
      setOpen(false);
      router.push("/materials");
      router.refresh();
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("materials").delete().eq("id", id);
    setBusy(false);
    if (error) {
      toast.error(
        error.code === "23503"
          ? "프로젝트에 배치된 자재는 삭제할 수 없습니다. 먼저 배치를 제거하세요."
          : `삭제 실패: ${error.message}`,
      );
      return;
    }
    toast.success("자재를 삭제했습니다.");
    setOpen(false);
    router.push("/materials");
    router.refresh();
  };

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
        삭제
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>자재 삭제</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{name}</span> 을(를) 삭제합니다. 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              취소
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
