"use client";

import { useState } from "react";
import { Eye, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LIGHT_PRESETS, kelvinToTemperature, temperatureToKelvin, type SceneSettings } from "@/lib/render/colorGrade";
import { useSceneStore } from "@/store/useSceneStore";
import { cn } from "@/lib/utils";

interface ControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onReset: () => void;
}

/** 슬라이더 + 숫자 입력 (접근성) · 더블클릭 리셋 */
function Control({ label, value, min, max, step, unit, format, onChange, onReset }: ControlProps) {
  const [text, setText] = useState<string | null>(null);
  const display = format ? format(value) : String(Math.round(value * 100) / 100);
  return (
    <div className="flex flex-col gap-1" onDoubleClick={onReset} title="더블클릭: 기본값">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={text ?? display}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
            }}
            onBlur={() => setText(null)}
            onDoubleClick={(e) => e.stopPropagation()}
            className="h-6 w-20 px-1.5 text-right text-xs tabular-nums"
            aria-label={label}
          />
          {unit && <span className="w-4 text-[10px] text-muted-foreground">{unit}</span>}
        </div>
      </div>
      <Slider min={min} max={max} step={step} value={value} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} aria-label={label} />
    </div>
  );
}

/** 조명 · 채도 패널 (모든 조절은 씬 전체 색보정 필터에 실시간 반영) */
export function SceneControls({ className }: { className?: string }) {
  const settings = useSceneStore((s) => s.settings);
  const setScene = useSceneStore((s) => s.set);
  const reset = useSceneStore((s) => s.reset);
  const resetAll = useSceneStore((s) => s.resetAll);
  const applyLightPreset = useSceneStore((s) => s.applyLightPreset);
  const compare = useSceneStore((s) => s.compareOriginal);
  const setCompare = useSceneStore((s) => s.setCompareOriginal);
  const shading = useSceneStore((s) => s.shadingStrength);
  const setShading = useSceneStore((s) => s.setShadingStrength);
  const userPresets = useSceneStore((s) => s.userPresets);
  const saveUserPreset = useSceneStore((s) => s.saveUserPreset);
  const applyUserPreset = useSceneStore((s) => s.applyUserPreset);
  const deleteUserPreset = useSceneStore((s) => s.deleteUserPreset);
  const [presetName, setPresetName] = useState("");

  const num = (key: keyof SceneSettings) => (v: number) => setScene({ [key]: v });

  return (
    <div className={cn("flex flex-col gap-3 p-3 text-xs", className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">조명 · 채도</h3>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="xs"
                  variant={compare ? "default" : "outline"}
                  onPointerDown={() => setCompare(true)}
                  onPointerUp={() => setCompare(false)}
                  onPointerLeave={() => setCompare(false)}
                  onPointerCancel={() => setCompare(false)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") setCompare(true);
                  }}
                  onKeyUp={() => setCompare(false)}
                />
              }
            >
              <Eye className="size-3" />
              원본과 비교
            </TooltipTrigger>
            <TooltipContent>누르고 있는 동안 보정 전 화면</TooltipContent>
          </Tooltip>
          <Button size="icon-xs" variant="ghost" title="모두 초기화" onClick={resetAll}>
            <RotateCcw className="size-3" />
          </Button>
        </div>
      </div>

      {/* 프리셋 */}
      <div className="flex flex-wrap gap-1">
        {LIGHT_PRESETS.map((p) => (
          <Tooltip key={p.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => applyLightPreset(p.id)}
                  aria-pressed={settings.light_preset === p.id}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-1.5 py-1 hover:bg-muted",
                    settings.light_preset === p.id && "border-foreground bg-muted",
                  )}
                />
              }
            >
              <span aria-hidden>{p.emoji}</span>
              {p.label}
            </TooltipTrigger>
            <TooltipContent>{p.description}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Control label="밝기" value={settings.brightness} min={0.5} max={1.5} step={0.01} onChange={num("brightness")} onReset={() => reset("brightness")} />
      <Control label="노출" value={settings.exposure} min={-2} max={2} step={0.05} unit="EV" onChange={num("exposure")} onReset={() => reset("exposure")} />
      <Control label="대비" value={settings.contrast} min={0.5} max={1.5} step={0.01} onChange={num("contrast")} onReset={() => reset("contrast")} />
      <Control label="채도" value={settings.saturation} min={0} max={2} step={0.01} onChange={num("saturation")} onReset={() => reset("saturation")} />
      <Control
        label="색온도"
        value={Math.round(temperatureToKelvin(settings.temperature))}
        min={2700}
        max={7500}
        step={50}
        unit="K"
        format={(v) => String(Math.round(v))}
        onChange={(k) => setScene({ temperature: kelvinToTemperature(k) })}
        onReset={() => reset("temperature")}
      />
      <Control label="색조 (녹 ↔ 마젠타)" value={settings.tint} min={-100} max={100} step={1} format={(v) => String(Math.round(v))} onChange={num("tint")} onReset={() => reset("tint")} />
      <Control label="그림자 복원" value={settings.shadow_lift} min={0} max={1} step={0.01} onChange={num("shadow_lift")} onReset={() => reset("shadow_lift")} />
      <Control label="비네팅" value={settings.vignette} min={0} max={1} step={0.01} onChange={num("vignette")} onReset={() => reset("vignette")} />
      <Control
        label="원본 조명 합성 (shading)"
        value={Math.round(shading * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        format={(v) => String(Math.round(v))}
        onChange={(v) => setShading(v / 100)}
        onReset={() => setShading(1)}
      />

      {/* 사용자 프리셋 */}
      <div className="flex flex-col gap-1.5 border-t pt-2">
        <Label className="text-xs">내 프리셋</Label>
        <div className="flex gap-1">
          <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="이름 (예: 우리 매장 조명)" className="h-6 text-xs" />
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              saveUserPreset(presetName);
              setPresetName("");
            }}
            disabled={!presetName.trim()}
          >
            <Save className="size-3" />
            저장
          </Button>
        </div>
        {userPresets.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {userPresets.map((p) => (
              <span key={p.name} className="inline-flex items-center gap-0.5 rounded-md border pl-1.5">
                <button type="button" className="py-0.5 hover:underline" onClick={() => applyUserPreset(p.name)}>
                  {p.name}
                </button>
                <button type="button" aria-label={`${p.name} 삭제`} className="rounded p-0.5 text-muted-foreground hover:text-destructive" onClick={() => deleteUserPreset(p.name)}>
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
