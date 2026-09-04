"use client";

import { useRef, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

export interface AnchorPoint {
  /** 0~1 */
  x: number;
  y: number;
}

interface AnchorPickerProps {
  src: string;
  anchor: AnchorPoint | null;
  onChange: (anchor: AnchorPoint) => void;
  label?: string;
  className?: string;
}

/**
 * 잘라낸 이미지 위에서 접지점(바닥/벽에 닿는 지점)을 클릭으로 지정한다.
 */
export function AnchorPicker({ src, anchor, onChange, label = "접지점", className }: AnchorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    onChange({ x, y });
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        ref={ref}
        onClick={handleClick}
        className="checkerboard relative inline-block max-w-full cursor-crosshair overflow-hidden rounded-lg border"
        title="클릭해서 접지점을 지정하세요"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="컷아웃 미리보기" className="block max-h-80 w-auto max-w-full select-none" draggable={false} />
        {anchor && (
          <div
            className="pointer-events-none absolute"
            style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}
          >
            <div className="absolute -top-px left-[-14px] h-0.5 w-7 bg-primary" />
            <div className="absolute -left-px top-[-14px] h-7 w-0.5 bg-primary" />
            <div className="absolute -top-2 -left-2 size-4 rounded-full border-2 border-primary bg-background/80" />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {anchor
          ? `${label}: (${(anchor.x * 100).toFixed(1)}%, ${(anchor.y * 100).toFixed(1)}%) — 다시 클릭하면 변경`
          : `이미지에서 ${label}을 클릭하세요`}
      </p>
    </div>
  );
}
