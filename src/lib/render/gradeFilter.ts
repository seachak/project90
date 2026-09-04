/**
 * 씬 전체 색보정 필터 (PixiJS v8 Filter, GLSL 1패스)
 * 원본 사진 + 타일 + 오브젝트가 합성된 최종 이미지에 적용된다.
 */
import { Filter, GlProgram } from "pixi.js";
import { gradeUniforms, type SceneSettings } from "@/lib/render/colorGrade";

const VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vScreen;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
  vScreen = aPosition;
}
`;

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uBrightness;
uniform float uShadowLift;
uniform float uVignette;
uniform float uEnabled;
uniform vec3 uTempTint;

vec3 applyGrade(vec3 c) {
  c *= exp2(uExposure);                             // 노출 (EV)
  c = (c - 0.5) * uContrast + 0.5;                  // 대비
  c *= uTempTint;                                   // 색온도 / 색조 (RGB 게인)
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));   // 휘도
  c = mix(vec3(l), c, uSaturation);                 // 채도
  c += uShadowLift * 0.35 * (1.0 - smoothstep(0.0, 0.5, l)); // 섀도우 리프트
  return clamp(c * uBrightness, 0.0, 1.0);
}

void main() {
  vec4 s = texture(uTexture, vTextureCoord);
  if (uEnabled < 0.5 || s.a <= 0.0001) {
    finalColor = s;
    return;
  }
  vec3 c = s.rgb / s.a;                             // premultiplied → straight
  c = applyGrade(c);
  float d = distance(vScreen, vec2(0.5)) * 1.41421356;
  c *= 1.0 - uVignette * 0.85 * smoothstep(0.45, 1.05, d);   // 비네팅
  finalColor = vec4(c * s.a, s.a);
}
`;

export class ColorGradeFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: "color-grade-filter" }),
      resources: {
        gradeUniforms: {
          uExposure: { value: 0, type: "f32" },
          uContrast: { value: 1, type: "f32" },
          uSaturation: { value: 1, type: "f32" },
          uBrightness: { value: 1, type: "f32" },
          uShadowLift: { value: 0, type: "f32" },
          uVignette: { value: 0, type: "f32" },
          uEnabled: { value: 1, type: "f32" },
          uTempTint: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
        },
      },
    });
  }

  private get u(): Record<string, unknown> {
    return (this.resources.gradeUniforms as { uniforms: Record<string, unknown> }).uniforms;
  }

  setSettings(settings: SceneSettings): void {
    const g = gradeUniforms(settings);
    const u = this.u;
    u.uExposure = g.exposure;
    u.uContrast = g.contrast;
    u.uSaturation = g.saturation;
    u.uBrightness = g.brightness;
    u.uShadowLift = g.shadowLift;
    u.uVignette = g.vignette;
    const tt = u.uTempTint as Float32Array;
    tt[0] = g.tempTint[0];
    tt[1] = g.tempTint[1];
    tt[2] = g.tempTint[2];
  }

  setEnabled(enabled: boolean): void {
    this.u.uEnabled = enabled ? 1 : 0;
  }
}
