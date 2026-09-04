"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { ImagePlus, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageDropzoneProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  hint?: string;
}

const IMAGE_TYPES = /^image\/(png|jpe?g|webp|avif|gif|bmp)$/i;

/** 드래그&드롭 + 클릭 업로드 영역 */
export function ImageDropzone({
  onFiles,
  multiple = true,
  accept = "image/*",
  disabled,
  compact,
  className,
  hint,
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const emit = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return;
      const files = Array.from(list).filter((f) => IMAGE_TYPES.test(f.type));
      if (files.length === 0) return;
      onFiles(multiple ? files : files.slice(0, 1));
    },
    [multiple, onFiles],
  );

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    emit(event.dataTransfer.files);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        compact ? "p-4" : "p-10",
        dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {compact ? (
        <ImagePlus className="size-5 text-muted-foreground" />
      ) : (
        <UploadCloud className="size-8 text-muted-foreground" />
      )}
      <p className="text-sm font-medium">
        {compact ? "이미지 추가" : "이미지를 끌어다 놓거나 클릭해서 선택"}
      </p>
      <p className="text-xs text-muted-foreground">
        {hint ?? (multiple ? "PNG · JPG · WebP, 여러 장 동시 업로드 가능" : "PNG · JPG · WebP")}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        disabled={disabled}
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
