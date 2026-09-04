"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Eraser, Paintbrush, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { canvasToBlob, loadImage } from "@/lib/image/loadImage";

interface EraserCanvasProps {
  /** 현재 컷아웃 (알파 PNG) */
  cutout: Blob;
  /** 복원용 원본 */
  original: Blob;
  onApply: (blob: Blob) => void;
  onCancel: () => void;
}

type Mode = "erase" | "restore";
const MAX_UNDO = 20;

/**
 * 수동 브러시 지우개 — 배경 제거 결과를 손으로 다듬는다.
 * erase: destination-out, restore: 원본을 브러시 영역에 다시 그림
 */
export function EraserCanvas({ cutout, original, onApply, onCancel }: EraserCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLImageElement | null>(null);
  const undoStack = useRef<ImageData[]>([]);
  const painting = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<Mode>("erase");
  const [brush, setBrush] = useState(24);
  const [ready, setReady] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadImage(cutout), loadImage(original)]).then(([cut, orig]) => {
      if (cancelled) return;
      const canvas = canvasRef.current!;
      canvas.width = cut.naturalWidth;
      canvas.height = cut.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(cut, 0, 0);
      originalRef.current = orig;
      undoStack.current = [];
      setCanUndo(false);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [cutout, original]);

  const toCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const paintSegment = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const radius = (brush / 2) * scale;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / (radius / 2)));
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      if (mode === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "#000";
        ctx.fill();
      } else if (originalRef.current) {
        ctx.clip();
        ctx.drawImage(originalRef.current, 0, 0, canvas.width, canvas.height);
      }
      ctx.restore();
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    setCanUndo(true);
    painting.current = true;
    canvas.setPointerCapture(event.pointerId);
    const p = toCanvasPoint(event);
    lastPoint.current = p;
    paintSegment(p, p);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!painting.current || !lastPoint.current) return;
    const p = toCanvasPoint(event);
    paintSegment(lastPoint.current, p);
    lastPoint.current = p;
  };

  const onPointerUp = () => {
    painting.current = false;
    lastPoint.current = null;
  };

  const undo = () => {
    const snapshot = undoStack.current.pop();
    if (!snapshot) return;
    canvasRef.current!.getContext("2d")!.putImageData(snapshot, 0, 0);
    setCanUndo(undoStack.current.length > 0);
  };

  const apply = async () => {
    const blob = await canvasToBlob(canvasRef.current!, "image/png");
    onApply(blob);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          value={[mode]}
          onValueChange={(value) => {
            const next = (value as Mode[])[0];
            if (next) setMode(next);
          }}
          variant="outline"
          size="sm"
          spacing={0}
        >
          <ToggleGroupItem value="erase" aria-label="지우기">
            <Eraser className="size-4" />
            지우기
          </ToggleGroupItem>
          <ToggleGroupItem value="restore" aria-label="복원">
            <Paintbrush className="size-4" />
            복원
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex min-w-40 flex-1 items-center gap-2 text-xs">
          <span className="whitespace-nowrap text-muted-foreground">브러시 {brush}px</span>
          <Slider
            min={4}
            max={120}
            value={brush}
            onValueChange={(value) => setBrush(Array.isArray(value) ? value[0] : value)}
            aria-label="브러시 크기"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo}>
          <Undo2 className="size-4" />
          실행취소
        </Button>
      </div>
      <div className="checkerboard overflow-auto rounded-lg border">
        <canvas
          ref={canvasRef}
          className="block max-h-[60vh] w-auto max-w-full cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button onClick={apply} disabled={!ready}>
          적용
        </Button>
      </div>
    </div>
  );
}
