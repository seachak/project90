/**
 * 데모/테스트용 합성 욕실 사진 생성 (SVG → JPEG)
 *   node scripts/gen-demo-room.mjs
 * 바닥·정면벽·좌우벽이 뚜렷한 평면으로 나뉘어 있어 매직완드/quad 테스트에 적합하다.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve("public/samples/rooms");
const W = 1600;
const H = 1200;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="back" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e9e4dc"/>
      <stop offset="1" stop-color="#cfc8be"/>
    </linearGradient>
    <linearGradient id="left" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b9b1a6"/>
      <stop offset="1" stop-color="#d9d3ca"/>
    </linearGradient>
    <linearGradient id="right" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#d2ccc2"/>
      <stop offset="1" stop-color="#a9a196"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9b9891"/>
      <stop offset="1" stop-color="#6f6c66"/>
    </linearGradient>
    <linearGradient id="ceil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f2ee"/>
      <stop offset="1" stop-color="#e2ded7"/>
    </linearGradient>
    <linearGradient id="window" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dfe9f2"/>
      <stop offset="1" stop-color="#b8cbdd"/>
    </linearGradient>
    <radialGradient id="light" cx="0.55" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.28"/>
    </radialGradient>
    <filter id="noise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
    </filter>
  </defs>
  <!-- 천장 -->
  <polygon points="0,0 1600,0 1200,250 400,250" fill="url(#ceil)"/>
  <!-- 좌측벽 -->
  <polygon points="0,0 400,250 400,850 0,1200" fill="url(#left)"/>
  <!-- 우측벽 -->
  <polygon points="1600,0 1600,1200 1200,850 1200,250" fill="url(#right)"/>
  <!-- 정면벽 -->
  <rect x="400" y="250" width="800" height="600" fill="url(#back)"/>
  <!-- 바닥 -->
  <polygon points="0,1200 400,850 1200,850 1600,1200" fill="url(#floor)"/>
  <!-- 창문 -->
  <rect x="640" y="330" width="320" height="220" fill="url(#window)" stroke="#f7f7f5" stroke-width="14"/>
  <line x1="800" y1="330" x2="800" y2="550" stroke="#f7f7f5" stroke-width="8"/>
  <!-- 문 (우측벽, 원근) -->
  <polygon points="1290,330 1420,240 1420,930 1290,790" fill="#8f8478" opacity="0.9"/>
  <!-- 벽-바닥 걸레받이 그림자 -->
  <polygon points="400,850 1200,850 1200,862 400,862" fill="#000" opacity="0.18"/>
  <polygon points="0,1200 400,850 400,862 8,1200" fill="#000" opacity="0.14"/>
  <polygon points="1600,1200 1200,850 1200,862 1592,1200" fill="#000" opacity="0.14"/>
  <!-- 벽 모서리·천장 경계의 앰비언트 오클루전 (실제 사진의 코너 음영) -->
  <line x1="400" y1="250" x2="400" y2="850" stroke="#000" stroke-opacity="0.22" stroke-width="5"/>
  <line x1="1200" y1="250" x2="1200" y2="850" stroke="#000" stroke-opacity="0.22" stroke-width="5"/>
  <line x1="400" y1="250" x2="1200" y2="250" stroke="#000" stroke-opacity="0.16" stroke-width="5"/>
  <line x1="0" y1="0" x2="400" y2="250" stroke="#000" stroke-opacity="0.14" stroke-width="5"/>
  <line x1="1600" y1="0" x2="1200" y2="250" stroke="#000" stroke-opacity="0.14" stroke-width="5"/>
  <!-- 조명 -->
  <rect width="${W}" height="${H}" fill="url(#light)"/>
  <rect width="${W}" height="${H}" filter="url(#noise)" opacity="1"/>
</svg>`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, "demo-bathroom.jpg");
  await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toFile(out);
  console.log(`wrote ${out} (${W}×${H})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
