import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENE,
  LIGHT_PRESETS,
  applyPreset,
  gradeUniforms,
  kelvinToRgb,
  kelvinToTemperature,
  normalizeScene,
  tempTintGain,
  temperatureToKelvin,
} from "@/lib/render/colorGrade";

describe("켈빈 ↔ temperature", () => {
  it("5500K 는 0, 2700K 는 +100(warm), 7500K 는 -100(cool)", () => {
    expect(kelvinToTemperature(5500)).toBe(0);
    expect(kelvinToTemperature(2700)).toBe(100);
    expect(kelvinToTemperature(7500)).toBe(-100);
  });
  it("왕복", () => {
    for (const k of [2700, 2900, 3000, 5000, 5500, 6500, 7500]) {
      expect(temperatureToKelvin(kelvinToTemperature(k))).toBeCloseTo(k, 6);
    }
  });
});

describe("kelvinToRgb", () => {
  it("따뜻할수록 파랑이 적고, 차가울수록 빨강이 적다", () => {
    const warm = kelvinToRgb(2700);
    const neutral = kelvinToRgb(5500);
    const cool = kelvinToRgb(7500);
    expect(warm[2]).toBeLessThan(neutral[2]);
    expect(cool[0]).toBeLessThan(neutral[0]);
    expect(warm[0]).toBe(1);
    expect(cool[2]).toBe(1);
  });
});

describe("tempTintGain", () => {
  it("중립(0, 0)은 (1,1,1)", () => {
    const g = tempTintGain(0, 0);
    g.forEach((v) => expect(v).toBeCloseTo(1, 6));
  });
  it("휘도를 보존한다", () => {
    for (const [t, tint] of [
      [100, 0],
      [-100, 0],
      [0, 100],
      [0, -100],
      [50, -30],
    ]) {
      const [r, g, b] = tempTintGain(t, tint);
      expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeCloseTo(1, 6);
    }
  });
  it("warm 은 R>B, cool 은 B>R, 마젠타는 G 감소", () => {
    const warm = tempTintGain(100, 0);
    const cool = tempTintGain(-100, 0);
    const magenta = tempTintGain(0, 100);
    const green = tempTintGain(0, -100);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(cool[2]).toBeGreaterThan(cool[0]);
    expect(magenta[1]).toBeLessThan(magenta[0]);
    expect(green[1]).toBeGreaterThan(green[0]);
  });
});

describe("프리셋", () => {
  it("5개 프리셋이 명세의 값을 갖는다", () => {
    const byId = Object.fromEntries(LIGHT_PRESETS.map((p) => [p.id, applyPreset(p)]));
    expect(temperatureToKelvin(byId.daylight.temperature)).toBeCloseTo(5500);
    expect(temperatureToKelvin(byId.warm.temperature)).toBeCloseTo(2900);
    expect(byId.warm.saturation).toBe(1.05);
    expect(byId.warm.shadow_lift).toBe(0.1);
    expect(temperatureToKelvin(byId.cool.temperature)).toBeCloseTo(6500);
    expect(byId.night.brightness).toBe(0.7);
    expect(byId.night.contrast).toBe(1.15);
    expect(byId.showroom.saturation).toBe(1.15);
    expect(byId.showroom.light_preset).toBe("showroom");
  });
  it("프리셋은 다른 값을 기본값으로 되돌린다", () => {
    const night = applyPreset(LIGHT_PRESETS.find((p) => p.id === "night")!);
    expect(night.vignette).toBe(DEFAULT_SCENE.vignette);
    expect(night.exposure).toBe(0);
  });
});

describe("gradeUniforms / normalizeScene", () => {
  it("DB 행(문자열 numeric)을 정규화한다", () => {
    const s = normalizeScene({ brightness: "1.2", saturation: "0.8", light_preset: "warm", temperature: null });
    expect(s.brightness).toBe(1.2);
    expect(s.saturation).toBe(0.8);
    expect(s.temperature).toBe(0);
    expect(s.light_preset).toBe("warm");
    expect(normalizeScene(null)).toEqual(DEFAULT_SCENE);
  });
  it("기본 설정의 유니폼은 항등", () => {
    const u = gradeUniforms(DEFAULT_SCENE);
    expect(u.exposure).toBe(0);
    expect(u.contrast).toBe(1);
    expect(u.saturation).toBe(1);
    expect(u.brightness).toBe(1);
    u.tempTint.forEach((v) => expect(v).toBeCloseTo(1, 6));
  });
});
