/**
 * 샘플 타일 텍스처(절차적 생성) + supabase/seed.sql 생성 스크립트
 *   node scripts/gen-samples.mjs
 *
 * 각 텍스처는 "타일 1장의 표면" 이다. 렌더러가 줄눈을 두고 타일을 낱장으로 배치하므로
 * 텍스처 자체의 이음매(seam)는 문제가 되지 않는다.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FIXTURES, fixtureSvg } from "./fixtures-svg.mjs";

const OUT_DIR = path.resolve("public/samples/tiles");
const FIXTURE_DIR = path.resolve("public/samples/fixtures");
const SEED_PATH = path.resolve("supabase/seed.sql");

// ---------- 난수 / 노이즈 ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rand = mulberry32(seed);
  const size = 256;
  const values = new Float32Array(size * size);
  for (let i = 0; i < values.length; i++) values[i] = rand();
  const fade = (t) => t * t * (3 - 2 * t);
  const at = (i, j) => values[((j & (size - 1)) * size) + (i & (size - 1))];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = fade(x - xi);
    const v = fade(y - yi);
    const a = at(xi, yi) * (1 - u) + at(xi + 1, yi) * u;
    const b = at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u;
    return a * (1 - v) + b * v;
  };
}

function fbm(noise, x, y, octaves = 5, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm; // 0~1
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const mix = (a, b, t) => a + (b - a) * t;
const mixRGB = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// ---------- 텍스처 생성기 ----------
function generate(spec) {
  const { w, h, seed = 1 } = spec;
  const noise = makeNoise(seed);
  const noise2 = makeNoise(seed + 101);
  const rand = mulberry32(seed + 7);
  const px = new Uint8Array(w * h * 3);
  const set = (x, y, rgb) => {
    const o = (y * w + x) * 3;
    px[o] = clamp(Math.round(rgb[0]));
    px[o + 1] = clamp(Math.round(rgb[1]));
    px[o + 2] = clamp(Math.round(rgb[2]));
  };
  const get = (x, y) => {
    const o = (y * w + x) * 3;
    return [px[o], px[o + 1], px[o + 2]];
  };
  const L = Math.max(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = [...spec.base];
      const nx = x / L;
      const ny = y / L;
      const grain = (fbm(noise, nx * 90, ny * 90, 3) - 0.5) * (spec.grain ?? 6);
      const cloud = (fbm(noise, nx * 6, ny * 6, 5) - 0.5) * (spec.cloud ?? 10);
      c = c.map((v) => v + grain + cloud);

      switch (spec.type) {
        case "marble": {
          const t = fbm(noise2, nx * 4, ny * 4, 6);
          const v1 = Math.abs(Math.sin((nx * 2.2 + ny * 1.4 + t * 3.6) * Math.PI));
          const v2 = Math.abs(Math.sin((nx * 5.1 - ny * 2.7 + t * 5.2) * Math.PI + 1.3));
          const vein = Math.pow(1 - v1, spec.veinSharp ?? 22) * (spec.veinStrength ?? 0.8)
            + Math.pow(1 - v2, 40) * (spec.veinStrength ?? 0.8) * 0.5;
          c = mixRGB(c, spec.vein, Math.min(1, vein));
          break;
        }
        case "wood": {
          const along = h >= w ? ny : nx;
          const across = h >= w ? nx : ny;
          const wobble = fbm(noise2, along * 40, across * 3, 4) * 1.6;
          const ring = Math.sin((across * (spec.rings ?? 9) + wobble) * Math.PI * 2);
          const g = 0.5 + 0.5 * ring;
          c = mixRGB(c, spec.grainColor, Math.pow(g, 3) * 0.75);
          // 미세 결
          const fine = (fbm(noise, along * 220, across * 30, 2) - 0.5) * 12;
          c = c.map((v) => v + fine);
          break;
        }
        case "concrete": {
          const speck = fbm(noise2, nx * 160, ny * 160, 2);
          if (speck > 0.72) c = c.map((v) => v - 28 * (speck - 0.72) / 0.28);
          if (speck < 0.18) c = c.map((v) => v + 18);
          const streak = (fbm(noise2, nx * 2, ny * 40, 3) - 0.5) * 10;
          c = c.map((v) => v + streak);
          break;
        }
        case "slate": {
          const layer = fbm(noise2, nx * 3, ny * 30, 4);
          const relief = (fbm(noise, nx * 12, ny * 12, 5) - 0.5) * 60;
          c = c.map((v) => v + relief + (layer - 0.5) * 30);
          break;
        }
        case "travertine": {
          const band = Math.sin((ny * 14 + fbm(noise2, nx * 3, ny * 3, 3) * 2) * Math.PI) * 6;
          c = c.map((v) => v + band);
          break;
        }
        default:
          break;
      }
      set(x, y, c);
    }
  }

  // 테라조 칩
  if (spec.type === "terrazzo") {
    const chips = Math.round((w * h) / 900);
    for (let i = 0; i < chips; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const rx = 2 + rand() * (L / 60);
      const ry = rx * (0.5 + rand() * 0.8);
      const ang = rand() * Math.PI;
      const chip = spec.chips[Math.floor(rand() * spec.chips.length)].map((v) => v + (rand() - 0.5) * 20);
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      for (let y = Math.max(0, Math.floor(cy - rx - 1)); y < Math.min(h, cy + rx + 1); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx - 1)); x < Math.min(w, cx + rx + 1); x++) {
          const dx = x - cx;
          const dy = y - cy;
          const u = (dx * cosA + dy * sinA) / rx;
          const v = (-dx * sinA + dy * cosA) / ry;
          if (u * u + v * v <= 1) set(x, y, chip);
        }
      }
    }
  }

  // 트래버틴 구멍
  if (spec.type === "travertine") {
    const pits = Math.round((w * h) / 2500);
    for (let i = 0; i < pits; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const r = 1 + rand() * 4;
      for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(h, cy + r + 1); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(w, cx + r + 1); x++) {
          const d = Math.hypot(x - cx, y - cy) / r;
          if (d <= 1) {
            const c = get(x, y).map((v) => v - 40 * (1 - d));
            set(x, y, c);
          }
        }
      }
    }
  }

  // 모자이크: 작은 정사각 셀 + 줄눈
  if (spec.type === "mosaic") {
    const n = spec.cells ?? 12;
    const cell = w / n;
    const gap = Math.max(1, cell * 0.08);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = Math.floor(x / cell);
        const j = Math.floor(y / cell);
        const lx = x - i * cell;
        const ly = y - j * cell;
        if (lx < gap || ly < gap) {
          set(x, y, spec.grout);
        } else {
          const jitter = (mulberry32(seed + i * 131 + j * 977)() - 0.5) * 16;
          const c = get(x, y).map((v) => v + jitter);
          // 살짝 볼록한 유광 느낌
          const ex = (lx - gap) / (cell - gap);
          const ey = (ly - gap) / (cell - gap);
          const hi = (1 - ex) * (1 - ey) * 14 - ex * ey * 8;
          set(x, y, c.map((v) => v + hi));
        }
      }
    }
  }

  // 유광 서브웨이: 가장자리 베벨 + 하이라이트
  if (spec.type === "subway") {
    const m = Math.round(Math.min(w, h) * 0.09);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dl = x / m;
        const dt = y / m;
        const dr = (w - 1 - x) / m;
        const db = (h - 1 - y) / m;
        let d = 0;
        if (dl < 1) d += (1 - dl) * 18;
        if (dt < 1) d += (1 - dt) * 22;
        if (dr < 1) d -= (1 - dr) * 12;
        if (db < 1) d -= (1 - db) * 16;
        const sheen = (1 - y / h) * 10 - 5;
        set(x, y, get(x, y).map((v) => v + d + sheen));
      }
    }
  }

  return px;
}

// ---------- 평균색 / 색 계열 ----------
function meanColor(px) {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = px.length / 3;
  for (let i = 0; i < px.length; i += 3) {
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
  }
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hueBucketOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const rn = ((n >> 16) & 255) / 255;
  const gn = ((n >> 8) & 255) / 255;
  const bn = (n & 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }
  if (l >= 0.88 && s <= 0.25) return "white";
  if (l <= 0.18) return "black";
  if (s <= 0.09) return l >= 0.85 ? "white" : "gray";
  if (h >= 15 && h <= 60 && s <= 0.55) return l >= 0.55 ? "beige" : "brown";
  if (h < 12 || h >= 345) return l >= 0.72 && s <= 0.6 ? "pink" : "red";
  if (h < 45) return l < 0.4 ? "brown" : "red";
  if (h < 70) return "yellow";
  if (h < 170) return "green";
  if (h < 260) return "blue";
  if (h < 305) return "purple";
  return "pink";
}

// ---------- 샘플 정의 (20종+) ----------
const GLOSS = { matte: 0.05, satin: 0.2, glossy: 0.45 };
const SAMPLES = [
  { id: 1, file: "white-matte", w: 512, h: 512, type: "plain", base: [236, 235, 232], seed: 11, kind: "tile_floor", name: "화이트 포세린 600각", tw: 600, th: 600, finish: "matte", price: 18000, tags: ["화이트", "포세린", "무광"] },
  { id: 2, file: "light-gray-matte", w: 512, h: 512, type: "plain", base: [200, 200, 198], seed: 12, kind: "tile_floor", name: "라이트 그레이 600각", tw: 600, th: 600, finish: "matte", price: 18000, tags: ["그레이", "무광"] },
  { id: 3, file: "dark-gray-matte", w: 512, h: 512, type: "plain", base: [92, 92, 94], seed: 13, cloud: 14, kind: "tile_floor", name: "다크 그레이 600각", tw: 600, th: 600, finish: "matte", price: 19000, tags: ["그레이", "무광", "모던"] },
  { id: 4, file: "sand-beige-matte", w: 512, h: 512, type: "plain", base: [214, 200, 178], seed: 14, kind: "tile_floor", name: "샌드 베이지 600각", tw: 600, th: 600, finish: "matte", price: 18000, tags: ["베이지", "무광", "내추럴"] },
  { id: 5, file: "carrara-marble", w: 512, h: 512, type: "marble", base: [240, 238, 234], vein: [150, 152, 160], seed: 15, kind: "tile_floor", name: "카라라 마블 600각 유광", tw: 600, th: 600, finish: "glossy", price: 32000, tags: ["대리석", "화이트", "유광"], randomRotate: true },
  { id: 6, file: "nero-marble", w: 384, h: 768, type: "marble", base: [34, 34, 38], vein: [200, 195, 185], veinStrength: 0.9, veinSharp: 26, seed: 16, kind: "tile_wall", name: "네로 마르퀴나 600×1200 유광", tw: 600, th: 1200, finish: "glossy", price: 48000, tags: ["대리석", "블랙", "유광", "럭셔리"], randomRotate: true },
  { id: 7, file: "terrazzo", w: 512, h: 512, type: "terrazzo", base: [226, 223, 216], chips: [[120, 110, 100], [80, 80, 85], [200, 180, 150], [150, 150, 150], [60, 50, 50], [190, 190, 195]], seed: 17, kind: "tile_floor", name: "테라조 600각", tw: 600, th: 600, finish: "satin", price: 36000, tags: ["테라조", "레트로"], randomRotate: true },
  { id: 8, file: "concrete", w: 384, h: 768, type: "concrete", base: [160, 160, 158], cloud: 22, seed: 18, kind: "tile_wall", name: "콘크리트 600×1200", tw: 600, th: 1200, finish: "matte", price: 42000, tags: ["콘크리트", "그레이", "인더스트리얼"] },
  { id: 9, file: "oak-plank", w: 128, h: 768, type: "wood", base: [198, 162, 114], grainColor: [150, 110, 70], rings: 9, seed: 19, kind: "tile_floor", name: "오크 우드 플랭크 200×1200", tw: 200, th: 1200, finish: "matte", price: 26000, tags: ["우드", "오크", "플랭크"] },
  { id: 10, file: "walnut-plank", w: 128, h: 768, type: "wood", base: [122, 86, 60], grainColor: [70, 45, 30], rings: 7, seed: 20, kind: "tile_floor", name: "월넛 우드 플랭크 150×900", tw: 150, th: 900, finish: "matte", price: 24000, tags: ["우드", "월넛", "플랭크"] },
  { id: 11, file: "subway-white", w: 512, h: 256, type: "subway", base: [246, 246, 244], grain: 2, cloud: 3, seed: 21, kind: "tile_wall", name: "서브웨이 화이트 150×75 유광", tw: 150, th: 75, finish: "glossy", price: 9000, tags: ["서브웨이", "화이트", "유광"], grout: "#cfcbc4" },
  { id: 12, file: "subway-sage", w: 768, h: 256, type: "subway", base: [176, 190, 172], grain: 2, cloud: 4, seed: 22, kind: "tile_wall", name: "서브웨이 세이지 300×100 유광", tw: 300, th: 100, finish: "glossy", price: 11000, tags: ["서브웨이", "그린", "유광"], grout: "#d9d5ce" },
  { id: 13, file: "mosaic-white", w: 512, h: 512, type: "mosaic", base: [244, 244, 242], grout: [205, 202, 196], cells: 12, grain: 2, cloud: 2, seed: 23, kind: "tile_wall", name: "화이트 모자이크 300×300 (25각)", tw: 300, th: 300, finish: "glossy", price: 15000, tags: ["모자이크", "화이트"], grout: "#cdcac4" },
  { id: 14, file: "terracotta", w: 512, h: 512, type: "plain", base: [196, 112, 78], cloud: 16, grain: 8, seed: 24, kind: "tile_floor", name: "테라코타 300각", tw: 300, th: 300, finish: "matte", price: 14000, tags: ["테라코타", "브라운", "내추럴"] },
  { id: 15, file: "navy-gloss", w: 256, h: 512, type: "subway", base: [36, 58, 98], grain: 2, cloud: 4, seed: 25, kind: "tile_wall", name: "네이비 300×600 유광", tw: 300, th: 600, finish: "glossy", price: 16000, tags: ["네이비", "블루", "유광"] },
  { id: 16, file: "sage-satin", w: 256, h: 512, type: "plain", base: [150, 170, 150], grain: 3, cloud: 6, seed: 26, kind: "tile_wall", name: "세이지 그린 300×600 새틴", tw: 300, th: 600, finish: "satin", price: 16000, tags: ["그린", "세이지", "새틴"] },
  { id: 17, file: "travertine", w: 512, h: 512, type: "travertine", base: [222, 206, 178], cloud: 12, seed: 27, kind: "tile_floor", name: "트래버틴 베이지 600각", tw: 600, th: 600, finish: "satin", price: 34000, tags: ["트래버틴", "베이지", "내추럴"], randomRotate: true },
  { id: 18, file: "slate-black", w: 256, h: 512, type: "slate", base: [52, 54, 58], cloud: 18, seed: 28, kind: "tile_floor", name: "슬레이트 블랙 300×600", tw: 300, th: 600, finish: "matte", price: 22000, tags: ["슬레이트", "블랙", "무광"] },
  { id: 19, file: "blush-satin", w: 512, h: 512, type: "plain", base: [226, 190, 190], grain: 3, cloud: 5, seed: 29, kind: "tile_wall", name: "블러시 핑크 200각 새틴", tw: 200, th: 200, finish: "satin", price: 12000, tags: ["핑크", "새틴", "파스텔"] },
  { id: 20, file: "cream-matte", w: 512, h: 512, type: "plain", base: [238, 230, 212], grain: 4, seed: 30, kind: "tile_floor", name: "크림 300각", tw: 300, th: 300, finish: "matte", price: 13000, tags: ["크림", "베이지", "무광"] },
  { id: 21, file: "gray-marble", w: 512, h: 512, type: "marble", base: [206, 206, 208], vein: [120, 120, 126], veinStrength: 0.7, seed: 31, kind: "tile_wall", name: "그레이 마블 600각 유광", tw: 600, th: 600, finish: "glossy", price: 30000, tags: ["대리석", "그레이", "유광"], randomRotate: true },
  { id: 22, file: "charcoal-large", w: 384, h: 768, type: "concrete", base: [70, 70, 72], cloud: 16, seed: 32, kind: "tile_wall", name: "차콜 600×1200 무광", tw: 600, th: 1200, finish: "matte", price: 44000, tags: ["차콜", "블랙", "무광", "대형"] },
];

function uuidFor(id) {
  return `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
}

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function sqlOrNull(s) {
  return s === null || s === undefined ? "null" : sqlString(s);
}

function numOrNull(n) {
  return n === null || n === undefined ? "null" : String(n);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const rows = [];
  for (const spec of SAMPLES) {
    const px = generate(spec);
    const file = `${spec.file}.webp`;
    await sharp(Buffer.from(px), { raw: { width: spec.w, height: spec.h, channels: 3 } })
      .webp({ quality: 88 })
      .toFile(path.join(OUT_DIR, file));
    const baseColor = meanColor(px);
    const meta = {
      hue_bucket: hueBucketOf(baseColor),
      sample: true,
      random_rotate: Boolean(spec.randomRotate),
      source_width: spec.w,
      source_height: spec.h,
    };
    rows.push({
      id: uuidFor(spec.id),
      kind: spec.kind,
      name: spec.name,
      brand: "샘플",
      model_code: `SMP-${String(spec.id).padStart(3, "0")}`,
      texture_url: `/samples/tiles/${file}`,
      thumbnail_url: `/samples/tiles/${file}`,
      tw: spec.tw,
      th: spec.th,
      grout: spec.grout ?? "#d8d5d0",
      grout_width: spec.tw <= 100 || spec.th <= 100 ? 2 : 3,
      finish: spec.finish,
      gloss: GLOSS[spec.finish],
      base_color: baseColor,
      price: spec.price,
      tags: spec.tags,
      meta,
      cutout_url: null,
      anchor_x: null,
      anchor_y: null,
      real_width_mm: null,
      real_height_mm: null,
      real_depth_mm: null,
      mount_type: null,
    });
    console.log(`generated ${file} (${spec.w}×${spec.h}) base=${baseColor} ${meta.hue_bucket}`);
  }

  // ---------- 위생도기 컷아웃 (알파 PNG) ----------
  await mkdir(FIXTURE_DIR, { recursive: true });
  let fixtureCount = 0;
  for (const spec of FIXTURES) {
    const file = `${spec.file}.png`;
    const buffer = await sharp(Buffer.from(fixtureSvg(spec)))
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(path.join(FIXTURE_DIR, file), buffer);
    const { width, height } = await sharp(buffer).metadata();
    rows.push({
      id: uuidFor(spec.id),
      kind: spec.kind,
      name: spec.name,
      brand: "샘플",
      model_code: `SMP-${String(spec.id).padStart(3, "0")}`,
      texture_url: null,
      thumbnail_url: `/samples/fixtures/${file}`,
      tw: null,
      th: null,
      grout: null,
      grout_width: null,
      finish: "glossy",
      gloss: GLOSS.glossy,
      base_color: "#eef0f1",
      price: spec.price,
      tags: spec.tags,
      meta: { sample: true, source_width: width, source_height: height },
      cutout_url: `/samples/fixtures/${file}`,
      anchor_x: spec.anchor_x,
      anchor_y: spec.anchor_y,
      real_width_mm: spec.real_width_mm,
      real_height_mm: spec.real_height_mm,
      real_depth_mm: spec.real_depth_mm,
      mount_type: spec.mount,
    });
    fixtureCount++;
    console.log(`generated ${file} (${width}×${height}) ${spec.real_width_mm}mm ${spec.mount}`);
  }

  const values = rows
    .map(
      (r) =>
        `  (${[
          sqlString(r.id),
          sqlString(r.kind),
          sqlString(r.name),
          sqlString(r.brand),
          sqlString(r.model_code),
          sqlOrNull(r.texture_url),
          sqlOrNull(r.thumbnail_url),
          numOrNull(r.tw),
          numOrNull(r.th),
          "true",
          sqlOrNull(r.grout),
          numOrNull(r.grout_width),
          sqlString(r.finish),
          r.gloss,
          sqlString(r.base_color),
          r.price,
          `array[${r.tags.map(sqlString).join(",")}]::text[]`,
          `${sqlString(JSON.stringify(r.meta))}::jsonb`,
          "true",
          sqlOrNull(r.cutout_url),
          numOrNull(r.anchor_x),
          numOrNull(r.anchor_y),
          numOrNull(r.real_width_mm),
          numOrNull(r.real_height_mm),
          numOrNull(r.real_depth_mm),
          sqlOrNull(r.mount_type),
        ].join(", ")})`,
    )
    .join(",\n");

  const sql = `-- =====================================================================
-- project90 seed — 샘플 타일 ${rows.length - fixtureCount}종 + 위생도기 ${fixtureCount}종
-- scripts/gen-samples.mjs 가 생성한 파일. 직접 수정하지 말고 스크립트를 고치세요.
-- 텍스처는 public/samples/tiles/, 도기 컷아웃은 public/samples/fixtures/ 에 있으며
-- 앱 도메인 기준 상대 경로로 참조한다.
-- 재실행해도 안전하다 (id 고정, upsert).
-- =====================================================================
insert into public.materials
  (id, kind, name, brand, model_code, texture_url, thumbnail_url,
   tile_width_mm, tile_height_mm, is_seamless, grout_color, grout_width_mm,
   finish, gloss, base_color, price, tags, meta, is_public,
   cutout_url, anchor_x, anchor_y, real_width_mm, real_height_mm, real_depth_mm, mount_type)
values
${values}
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  brand = excluded.brand,
  model_code = excluded.model_code,
  texture_url = excluded.texture_url,
  thumbnail_url = excluded.thumbnail_url,
  tile_width_mm = excluded.tile_width_mm,
  tile_height_mm = excluded.tile_height_mm,
  is_seamless = excluded.is_seamless,
  grout_color = excluded.grout_color,
  grout_width_mm = excluded.grout_width_mm,
  finish = excluded.finish,
  gloss = excluded.gloss,
  base_color = excluded.base_color,
  price = excluded.price,
  tags = excluded.tags,
  meta = excluded.meta,
  is_public = excluded.is_public,
  cutout_url = excluded.cutout_url,
  anchor_x = excluded.anchor_x,
  anchor_y = excluded.anchor_y,
  real_width_mm = excluded.real_width_mm,
  real_height_mm = excluded.real_height_mm,
  real_depth_mm = excluded.real_depth_mm,
  mount_type = excluded.mount_type;
`;
  await writeFile(SEED_PATH, sql, "utf8");
  console.log(`wrote ${SEED_PATH} (${rows.length} rows)`);

  // 개발용 매니페스트 (Supabase 없이 /dev/* 라우트에서 자재 목록으로 사용)
  const manifest = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    brand: r.brand,
    model_code: r.model_code,
    texture_url: r.texture_url,
    thumbnail_url: r.thumbnail_url,
    tile_width_mm: r.tw,
    tile_height_mm: r.th,
    is_seamless: true,
    grout_color: r.grout,
    grout_width_mm: r.grout_width,
    finish: r.finish,
    gloss: r.gloss,
    base_color: r.base_color,
    price: r.price,
    currency: "KRW",
    tags: r.tags,
    meta: r.meta,
    is_public: true,
    cutout_url: r.cutout_url,
    anchor_x: r.anchor_x,
    anchor_y: r.anchor_y,
    real_width_mm: r.real_width_mm,
    real_height_mm: r.real_height_mm,
    real_depth_mm: r.real_depth_mm,
    mount_type: r.mount_type,
  }));
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`wrote ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
