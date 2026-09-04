/**
 * 조명 / 채도 보정 — 씬 설정, 프리셋, 셰이더 유니폼 계산 (순수 함수)
 *
 * DB(scene_settings) 의 temperature 는 -100(cool) ~ +100(warm) 이고
 * UI 는 켈빈(2700K~7500K)으로 보여준다. 0 = 5500K = 보정 없음.
 */
export interface SceneSettings {
  brightness: number; // 0.5 ~ 1.5
  contrast: number; // 0.5 ~ 1.5
  saturation: number; // 0 ~ 2
  temperature: number; // -100 ~ 100
  tint: number; // -100(green) ~ 100(magenta)
  exposure: number; // -2 ~ 2 EV
  shadow_lift: number; // 0 ~ 1
  light_preset: string; // 'daylight' | 'warm' | 'cool' | 'night' | 'showroom' | 'custom'
  vignette: number; // 0 ~ 1
}

export const DEFAULT_SCENE: SceneSettings = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  tint: 0,
  exposure: 0,
  shadow_lift: 0,
  light_preset: "daylight",
  vignette: 0,
};

export const KELVIN_MIN = 2700;
export const KELVIN_NEUTRAL = 5500;
export const KELVIN_MAX = 7500;

/** 켈빈 → temperature(-100~100). 5500K = 0, 2700K = +100(warm), 7500K = -100(cool) */
export function kelvinToTemperature(kelvin: number): number {
  const k = Math.min(KELVIN_MAX, Math.max(KELVIN_MIN, kelvin));
  if (k <= KELVIN_NEUTRAL) return ((KELVIN_NEUTRAL - k) / (KELVIN_NEUTRAL - KELVIN_MIN)) * 100;
  return -((k - KELVIN_NEUTRAL) / (KELVIN_MAX - KELVIN_NEUTRAL)) * 100;
}

export function temperatureToKelvin(temperature: number): number {
  const t = Math.min(100, Math.max(-100, temperature));
  if (t >= 0) return KELVIN_NEUTRAL - (t / 100) * (KELVIN_NEUTRAL - KELVIN_MIN);
  return KELVIN_NEUTRAL + (-t / 100) * (KELVIN_MAX - KELVIN_NEUTRAL);
}

/** 흑체 색온도 → 정규화 RGB (Tanner Helland 근사) */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const clamp = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  return [clamp(r), clamp(g), clamp(b)];
}

function luma([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 색온도·색조 → RGB 게인 (휘도 보존). 5500K, tint 0 이면 (1,1,1)
 */
export function tempTintGain(temperature: number, tint: number): [number, number, number] {
  const target = kelvinToRgb(temperatureToKelvin(temperature));
  const neutral = kelvinToRgb(KELVIN_NEUTRAL);
  let gain: [number, number, number] = [target[0] / neutral[0], target[1] / neutral[1], target[2] / neutral[2]];
  // 색조: 녹색(-) ↔ 마젠타(+)
  const t = Math.min(100, Math.max(-100, tint)) / 100;
  if (t > 0) gain = [gain[0], gain[1] * (1 - 0.25 * t), gain[2]];
  else if (t < 0) gain = [gain[0] * (1 + 0.25 * t), gain[1], gain[2] * (1 + 0.25 * t)];
  const l = luma(gain);
  return l > 0 ? [gain[0] / l, gain[1] / l, gain[2] / l] : [1, 1, 1];
}

export interface GradeUniforms {
  exposure: number;
  contrast: number;
  saturation: number;
  brightness: number;
  shadowLift: number;
  vignette: number;
  tempTint: [number, number, number];
}

export function gradeUniforms(s: SceneSettings): GradeUniforms {
  return {
    exposure: s.exposure,
    contrast: s.contrast,
    saturation: s.saturation,
    brightness: s.brightness,
    shadowLift: s.shadow_lift,
    vignette: s.vignette,
    tempTint: tempTintGain(s.temperature, s.tint),
  };
}

// ---------- 프리셋 ----------
export interface LightPreset {
  id: string;
  emoji: string;
  label: string;
  description: string;
  settings: Partial<SceneSettings>;
}

export const LIGHT_PRESETS: LightPreset[] = [
  { id: "daylight", emoji: "☀️", label: "자연광", description: "5500K · 채도 1.0", settings: { temperature: kelvinToTemperature(5500), saturation: 1.0 } },
  {
    id: "warm",
    emoji: "💡",
    label: "전구색",
    description: "2900K · 채도 1.05 · 그림자 +0.1 (국내 욕실 실사용)",
    settings: { temperature: kelvinToTemperature(2900), saturation: 1.05, shadow_lift: 0.1 },
  },
  { id: "cool", emoji: "❄️", label: "주광색", description: "6500K · 채도 0.95", settings: { temperature: kelvinToTemperature(6500), saturation: 0.95 } },
  {
    id: "night",
    emoji: "🌙",
    label: "야간",
    description: "3000K · 밝기 0.7 · 대비 1.15",
    settings: { temperature: kelvinToTemperature(3000), brightness: 0.7, contrast: 1.15 },
  },
  {
    id: "showroom",
    emoji: "🏢",
    label: "쇼룸",
    description: "5000K · 밝기 1.1 · 대비 1.1 · 채도 1.15",
    settings: { temperature: kelvinToTemperature(5000), brightness: 1.1, contrast: 1.1, saturation: 1.15 },
  },
];

/** 프리셋 적용: 기본값 위에 프리셋 값을 덮는다 */
export function applyPreset(preset: LightPreset): SceneSettings {
  return { ...DEFAULT_SCENE, ...preset.settings, light_preset: preset.id };
}

/** DB 행(부분/문자열 가능) → SceneSettings */
export function normalizeScene(row: Partial<Record<keyof SceneSettings, unknown>> | null | undefined): SceneSettings {
  if (!row) return { ...DEFAULT_SCENE };
  const num = (v: unknown, d: number) => {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) ? (n as number) : d;
  };
  return {
    brightness: num(row.brightness, 1),
    contrast: num(row.contrast, 1),
    saturation: num(row.saturation, 1),
    temperature: num(row.temperature, 0),
    tint: num(row.tint, 0),
    exposure: num(row.exposure, 0),
    shadow_lift: num(row.shadow_lift, 0),
    light_preset: typeof row.light_preset === "string" ? row.light_preset : "daylight",
    vignette: num(row.vignette, 0),
  };
}
