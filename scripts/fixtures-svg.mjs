/**
 * 데모용 위생도기 컷아웃(알파 PNG)의 절차적 SVG 생성.
 *
 * 실제 제품 사진 대신, 형태·명암이 읽히는 도자기 느낌의 벡터 도형을 그린다.
 * 배경은 완전 투명이라 렌더러의 알파 히트테스트·접지 그림자가 실제 컷아웃과 동일하게 동작한다.
 *
 * 각 spec 의 real_* 치수는 실제 위생도기 규격에 가깝게 잡았다 —
 * 시뮬레이터가 이 값과 바닥 호모그래피만으로 사진 속 크기를 자동 산출하기 때문이다.
 */

/** 도자기 공통 그라디언트·필터 정의 */
function ceramicDefs(id, { light = "#ffffff", mid = "#eef0f1", dark = "#c9ced2" } = {}) {
  return `
  <defs>
    <linearGradient id="body-${id}" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0%" stop-color="${dark}"/>
      <stop offset="22%" stop-color="${mid}"/>
      <stop offset="52%" stop-color="${light}"/>
      <stop offset="82%" stop-color="${mid}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </linearGradient>
    <linearGradient id="top-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="100%" stop-color="${mid}"/>
    </linearGradient>
    <radialGradient id="bowl-${id}" cx="0.5" cy="0.35" r="0.75">
      <stop offset="0%" stop-color="#9aa2a8"/>
      <stop offset="55%" stop-color="#c3cace"/>
      <stop offset="100%" stop-color="${mid}"/>
    </radialGradient>
    <linearGradient id="chrome-${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#6b7280"/>
      <stop offset="30%" stop-color="#e5e7eb"/>
      <stop offset="55%" stop-color="#9ca3af"/>
      <stop offset="100%" stop-color="#4b5563"/>
    </linearGradient>
    <linearGradient id="ao-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.28"/>
    </linearGradient>
  </defs>`;
}

function svg(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}

/** 양변기 — 3/4 측면 뷰, 물탱크 + 도기 + 시트 */
function toilet() {
  const w = 420;
  const h = 720;
  return svg(
    w,
    h,
    `${ceramicDefs("t")}
    <g>
      <!-- 물탱크 -->
      <rect x="88" y="96" width="244" height="196" rx="26" fill="url(#body-t)"/>
      <rect x="104" y="112" width="212" height="26" rx="13" fill="#ffffff" opacity="0.55"/>
      <rect x="88" y="262" width="244" height="30" rx="14" fill="url(#ao-t)" opacity="0.5"/>
      <!-- 탱크 뚜껑 -->
      <rect x="76" y="72" width="268" height="40" rx="18" fill="url(#top-t)"/>
      <!-- 물내림 버튼 -->
      <ellipse cx="210" cy="92" rx="30" ry="12" fill="url(#chrome-t)"/>
      <!-- 시트 / 커버 -->
      <ellipse cx="210" cy="330" rx="146" ry="52" fill="url(#top-t)"/>
      <ellipse cx="210" cy="336" rx="118" ry="36" fill="url(#bowl-t)"/>
      <ellipse cx="210" cy="332" rx="118" ry="34" fill="#ffffff" opacity="0.18"/>
      <!-- 도기 몸통 -->
      <path d="M74 336 C 74 470, 108 560, 128 640 L 292 640 C 312 560, 346 470, 346 336 C 300 372, 120 372, 74 336 Z" fill="url(#body-t)"/>
      <path d="M120 470 C 150 500, 270 500, 300 470 L 292 640 L 128 640 Z" fill="#000000" opacity="0.05"/>
      <!-- 접지 베이스 -->
      <path d="M120 640 L 300 640 C 306 664, 306 678, 296 686 L 124 686 C 114 678, 114 664, 120 640 Z" fill="url(#body-t)"/>
      <rect x="118" y="668" width="184" height="20" rx="8" fill="url(#ao-t)"/>
    </g>`,
  );
}

/** 세면기 — 벽걸이형, 상판 + 볼 + 수전홀 */
function basin() {
  const w = 620;
  const h = 380;
  return svg(
    w,
    h,
    `${ceramicDefs("b")}
    <g>
      <!-- 상판 -->
      <path d="M40 92 L580 92 C596 92, 604 102, 602 118 L596 172 C594 188, 582 196, 566 196 L54 196 C38 196, 26 188, 24 172 L18 118 C16 102, 24 92, 40 92 Z" fill="url(#body-b)"/>
      <rect x="34" y="96" width="552" height="18" rx="9" fill="#ffffff" opacity="0.5"/>
      <!-- 볼 -->
      <ellipse cx="310" cy="150" rx="176" ry="44" fill="url(#bowl-b)"/>
      <ellipse cx="310" cy="146" rx="176" ry="42" fill="#ffffff" opacity="0.14"/>
      <ellipse cx="310" cy="160" rx="26" ry="8" fill="#8b939a" opacity="0.7"/>
      <!-- 하부 곡면 -->
      <path d="M54 196 L566 196 C544 262, 452 306, 310 306 C168 306, 76 262, 54 196 Z" fill="url(#body-b)"/>
      <path d="M120 250 C 200 292, 420 292, 500 250 C 440 296, 180 296, 120 250 Z" fill="#000000" opacity="0.07"/>
      <!-- 수전 -->
      <rect x="292" y="52" width="36" height="52" rx="14" fill="url(#chrome-b)"/>
      <path d="M300 62 C 300 30, 372 26, 372 62 L372 96 L352 96 L352 66 C352 48, 320 48, 320 66 Z" fill="url(#chrome-b)"/>
    </g>`,
  );
}

/** 욕조 — 정면 뷰 */
function bathtub() {
  const w = 900;
  const h = 340;
  return svg(
    w,
    h,
    `${ceramicDefs("h")}
    <g>
      <!-- 몸통 -->
      <path d="M46 92 L854 92 C866 92, 872 100, 870 112 L836 268 C830 292, 812 302, 790 302 L110 302 C88 302, 70 292, 64 268 L30 112 C28 100, 34 92, 46 92 Z" fill="url(#body-h)"/>
      <!-- 림(테두리) -->
      <path d="M40 84 L860 84 C874 84, 880 94, 878 106 L874 124 L26 124 L22 106 C20 94, 26 84, 40 84 Z" fill="url(#top-h)"/>
      <!-- 내부 -->
      <path d="M86 124 L814 124 L786 246 C782 262, 770 270, 754 270 L146 270 C130 270, 118 262, 114 246 Z" fill="url(#bowl-h)"/>
      <path d="M86 124 L814 124 L806 158 L94 158 Z" fill="#ffffff" opacity="0.22"/>
      <!-- 배수구 -->
      <ellipse cx="450" cy="252" rx="22" ry="7" fill="#8b939a" opacity="0.75"/>
      <!-- 접지 그늘 -->
      <rect x="110" y="282" width="680" height="20" rx="9" fill="url(#ao-h)"/>
    </g>`,
  );
}

/** 수전 — 벽붙이 */
function faucet() {
  const w = 260;
  const h = 300;
  return svg(
    w,
    h,
    `${ceramicDefs("f")}
    <g>
      <rect x="26" y="112" width="52" height="76" rx="20" fill="url(#chrome-f)"/>
      <path d="M42 130 C 42 66, 214 60, 214 132 L214 206 L182 206 L182 138 C182 100, 74 100, 74 138 Z" fill="url(#chrome-f)"/>
      <rect x="176" y="196" width="44" height="26" rx="10" fill="url(#chrome-f)"/>
      <rect x="60" y="84" width="120" height="16" rx="8" fill="url(#chrome-f)"/>
      <circle cx="60" cy="92" r="18" fill="url(#chrome-f)"/>
      <circle cx="180" cy="92" r="18" fill="url(#chrome-f)"/>
    </g>`,
  );
}

/** 샤워 — 해바라기 헤드 + 슬라이드바 */
function shower() {
  const w = 300;
  const h = 620;
  return svg(
    w,
    h,
    `${ceramicDefs("s")}
    <g>
      <rect x="128" y="40" width="26" height="70" rx="10" fill="url(#chrome-s)"/>
      <path d="M40 108 L262 108 C272 108, 278 118, 274 128 L266 146 L36 146 L28 128 C24 118, 30 108, 40 108 Z" fill="url(#chrome-s)"/>
      <ellipse cx="151" cy="148" rx="115" ry="12" fill="#9ca3af"/>
      <rect x="138" y="196" width="26" height="330" rx="12" fill="url(#chrome-s)"/>
      <rect x="118" y="500" width="66" height="30" rx="12" fill="url(#chrome-s)"/>
      <rect x="120" y="230" width="62" height="44" rx="14" fill="url(#chrome-s)"/>
      <circle cx="151" cy="322" r="22" fill="url(#chrome-s)"/>
    </g>`,
  );
}

/**
 * 데모 위생도기 목록.
 *   real_width_mm / real_height_mm : 실제 규격 → 사진 속 크기 자동 산출의 입력
 *   anchor_x / anchor_y            : 컷아웃 안에서 바닥(또는 벽)에 닿는 지점 (0~1)
 *   mount                          : floor | wall | countertop
 */
export const FIXTURES = [
  {
    id: 51,
    file: "toilet-white",
    kind: "toilet",
    name: "원피스 양변기 화이트",
    draw: toilet,
    real_width_mm: 380,
    real_height_mm: 760,
    real_depth_mm: 700,
    anchor_x: 0.5,
    anchor_y: 0.985,
    mount: "floor",
    price: 320000,
    tags: ["양변기", "원피스", "화이트"],
  },
  {
    id: 52,
    file: "basin-wall",
    kind: "basin",
    name: "벽걸이 세면기 600",
    draw: basin,
    real_width_mm: 600,
    real_height_mm: 370,
    real_depth_mm: 450,
    anchor_x: 0.5,
    anchor_y: 0.9,
    mount: "wall",
    price: 210000,
    tags: ["세면기", "벽걸이", "화이트"],
  },
  {
    id: 53,
    file: "bathtub-white",
    kind: "bathtub",
    name: "매립형 욕조 1700",
    draw: bathtub,
    real_width_mm: 1700,
    real_height_mm: 600,
    real_depth_mm: 750,
    anchor_x: 0.5,
    anchor_y: 0.97,
    mount: "floor",
    price: 680000,
    tags: ["욕조", "1700", "화이트"],
  },
  {
    id: 54,
    file: "faucet-chrome",
    kind: "faucet",
    name: "벽붙이 수전 크롬",
    draw: faucet,
    real_width_mm: 220,
    real_height_mm: 250,
    real_depth_mm: 180,
    anchor_x: 0.2,
    anchor_y: 0.5,
    mount: "wall",
    price: 89000,
    tags: ["수전", "크롬", "벽붙이"],
  },
  {
    id: 55,
    file: "shower-rain",
    kind: "shower",
    name: "해바라기 샤워 세트",
    draw: shower,
    real_width_mm: 300,
    real_height_mm: 1250,
    real_depth_mm: 380,
    anchor_x: 0.5,
    anchor_y: 0.08,
    mount: "wall",
    price: 240000,
    tags: ["샤워", "해바라기", "크롬"],
  },
];

/** spec → SVG 문자열 */
export function fixtureSvg(spec) {
  return spec.draw();
}
