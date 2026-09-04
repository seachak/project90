/**
 * GLSL ES 3.00 셰이더 소스.
 * PixiJS v8 은 소스에 "#version 300 es" 가 있어야 ES3 로 취급하고(정밀도·define 삽입 후 다시 붙임),
 * 3×3 사영행렬은 Pixi Matrix(아핀)로 표현할 수 없으므로 열(column) 3개를 vec3 로 넘긴다.
 */

/** 표면 메시 정점 셰이더 — 이미지 좌표(aPosition)를 그대로 varying 으로 넘긴다 */
export const SURFACE_VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vImagePos;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vImagePos = aPosition;
}
`;

/**
 * 표면 프래그먼트 셰이더
 *  - uInvH0/1/2: 이미지 px → 정면(mm) 호모그래피 역행렬의 열 벡터
 *  - uPattern: 정면 뷰 타일 패턴 (patternRect 를 0~1 로)
 *  - uMask: 폴리곤 마스크 (이미지 전체 0~1, 알파)
 *  - uShading: 조명 맵 (R: 0.5 = 1.0 배, G: 디테일 0.5 = 0) — Phase 5. uUseShading = 0 이면 무시
 */
export const SURFACE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vImagePos;
out vec4 finalColor;

uniform sampler2D uPattern;
uniform sampler2D uMask;
uniform sampler2D uShading;

uniform vec3 uInvH0;
uniform vec3 uInvH1;
uniform vec3 uInvH2;
uniform vec4 uPatternRect;   // minX, minY, width, height (mm)
uniform vec2 uImageSize;
uniform float uOpacity;
uniform float uGloss;
uniform float uUseShading;
uniform float uDetailStrength;

void main() {
  mat3 invH = mat3(uInvH0, uInvH1, uInvH2);
  vec3 q = invH * vec3(vImagePos, 1.0);
  vec2 imgUv = vImagePos / uImageSize;
  float m = texture(uMask, imgUv).a;
  if (q.z <= 1e-6 || m <= 0.002) {
    finalColor = vec4(0.0);
    return;
  }
  vec2 mm = q.xy / q.z;
  vec2 uv = (mm - uPatternRect.xy) / uPatternRect.zw;

  vec4 c = texture(uPattern, uv);
  vec3 rgb = c.rgb;

  if (uUseShading > 0.5) {
    vec4 sh = texture(uShading, imgUv);
    float light = sh.r * 2.0;                    // 0.5 → 1.0
    float detail = (sh.g - 0.5) * 2.0 * uDetailStrength;
    rgb = rgb * light + detail;
    float hi = smoothstep(1.05, 1.6, light);      // 유광 하이라이트
    rgb += uGloss * hi * 0.6;
  }

  float a = m * uOpacity;
  finalColor = vec4(clamp(rgb, 0.0, 1.0) * a, a);   // premultiplied
}
`;
