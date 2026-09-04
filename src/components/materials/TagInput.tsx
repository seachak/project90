"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  id?: string;
  className?: string;
}

/** 태그 입력 (Enter/쉼표로 추가, 기존 태그 자동완성) */
export function TagInput({ value, onChange, suggestions = [], placeholder, id, className }: TagInputProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    return suggestions
      .filter((s) => !value.includes(s) && (q === "" || s.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [suggestions, text, value]);

  const add = (tag: string) => {
    const t = tag.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(text);
    } else if (event.key === "Backspace" && text === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              aria-label={`${tag} 삭제`}
              className="rounded-sm hover:bg-foreground/10"
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={value.length === 0 ? (placeholder ?? "태그 입력 후 Enter") : ""}
          className="h-6 min-w-24 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
      {focused && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
