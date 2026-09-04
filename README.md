# project90 — 욕실·주방 리모델링 타일/위생도기 실시간 시뮬레이터

영업사원이나 소비자가 **시공 전 현장 사진 위에 실제 판매 자재(타일·양변기·세면기·욕조·수전)를 클릭 한 번으로 입혀 보고**,
Before/After 를 즉시 비교하며, 조명·채도를 조절해 현장 분위기에 맞춰 볼 수 있는 웹앱입니다.

렌더링은 AI 이미지 생성이 아니라 **캔버스 기반 실시간 마스크 합성**입니다. 60fps 로 즉시 반응하고,
API 비용이 없으며, 같은 입력이면 항상 같은 결과가 나옵니다.

## 기술 스택

| 영역 | 스택 |
| --- | --- |
| 프레임워크 | Next.js 15 (App Router) + TypeScript (strict) |
| 스타일 | Tailwind CSS v4 + shadcn/ui |
| 렌더링 엔진 | HTML5 Canvas 2D + WebGL (PixiJS v8) 하이브리드 |
| 상태관리 | Zustand |
| 백엔드 | Supabase (Postgres + Storage + Auth + Realtime) |
| 이미지 전처리 | sharp (서버), 브라우저 Canvas / Web Worker |
| 배포 | Vercel + GitHub Actions |
| 패키지 매니저 | pnpm 9 |

## 시작하기

### 요구사항

- Node.js 22 LTS (`.node-version` 참고)
- pnpm 9 — `corepack enable && corepack prepare pnpm@9.15.9 --activate`

### 설치

```bash
pnpm install
cp .env.local.example .env.local   # 값 채우기 (아래 참고)
pnpm dev                            # http://localhost:3000
```

### 환경변수 (`.env.local`)

| 변수 | 얻는 곳 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jxmwamgfgqqsedhjvpwn.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 대시보드 → Settings → API → `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면의 `service_role` (서버 전용, 절대 커밋 금지) |
| `SUPABASE_PROJECT_REF` | `jxmwamgfgqqsedhjvpwn` |
| `NEXT_PUBLIC_SITE_URL` | 로컬 `http://localhost:3000`, 배포 시 Vercel 도메인 |

`.env*.local` 은 `.gitignore` 에 포함되어 있습니다.

## Supabase 설정 체크리스트 (대시보드에서 1회)

대시보드: <https://supabase.com/dashboard/project/jxmwamgfgqqsedhjvpwn>

1. **스키마 생성** — SQL Editor 에서 `supabase/migrations/` 의 SQL 파일을 번호 순서대로 실행합니다.
   - [`0001_init.sql`](supabase/migrations/0001_init.sql): 테이블·RLS·Realtime·Storage 버킷(textures, cutouts, thumbnails, projects, renders)·공유 RPC
   - [`0002_surface_editor.sql`](supabase/migrations/0002_surface_editor.sql): 마스킹 에디터 상태 컬럼(`surfaces.editor`)

   (또는 아래 GitHub 통합을 설정하면 `main` 푸시 시 자동 적용됩니다.)
2. **Auth → URL Configuration**
   - Site URL: `http://localhost:3000` (배포 후 Vercel 도메인으로 변경)
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://<vercel-domain>/auth/callback`
3. **Auth → Providers**
   - Email: 활성화 (매직링크 사용, "Confirm email" 은 켜두어도 됩니다)
   - Google: Google Cloud Console 에서 OAuth Client ID/Secret 발급 후 입력.
     승인된 리디렉션 URI 에 `https://jxmwamgfgqqsedhjvpwn.supabase.co/auth/v1/callback` 추가
4. **Integrations → GitHub** (선택, 마이그레이션 자동화)
   - 저장소 `seachak/project90`, Supabase directory `supabase`, Production branch `main`, Branching 활성화
5. **샘플 타일 적재 (선택)** — SQL Editor 에서 [`supabase/seed.sql`](supabase/seed.sql) 실행.
   절차적으로 생성한 타일 텍스처 22종(`public/samples/tiles/`)이 공개 자재로 들어갑니다. 재실행해도 안전합니다(upsert).
   텍스처를 다시 만들려면 `pnpm samples:gen`.
6. **타입 재생성** — 스키마를 바꿨다면 `pnpm supabase login` 후 `pnpm db:types`

## 자재 등록 (기능 1)

- `/materials/new` — 종류 선택 → 이미지 드래그&드롭(여러 장) → 자동 분석
  - 타일: 규격 프리셋, 줄눈 색/두께, 마감(무광 0.05 / 새틴 0.2 / 유광 0.45), **이음매 자동 검사**(가장자리 픽셀 차 ÷ 내부 인접 픽셀 차),
    이음매가 있으면 거울 반복 / 오프셋 블렌드 보정, 3×3 타일링 미리보기(타일별 ±3% 밝기 변화, 랜덤 90° 회전)
  - 위생도기: **온디바이스 배경 제거**(@imgly/background-removal, 최초 1회 모델 다운로드), 실패 시 수동 브러시 지우개,
    실제 치수 W×H×D, 접지점 클릭 지정, 설치 방식(바닥/벽걸이/카운터탑)
  - 저장 시 원본 → Storage(`textures` / `cutouts`), 서버(sharp)에서 400px WebP 썸네일 → `thumbnails`, 대표색은 k-means 로 자동 추출
- `/materials` — 종류 탭, 색상 계열 필터, 규격 필터, 검색, 그리드/리스트, 무한 스크롤, 내 자재만 보기
- **CSV/엑셀 일괄 등록** — 목록 화면의 버튼. 헤더는 한국어/영어 모두 인식하며 템플릿 CSV 를 내려받을 수 있습니다.

  | 컬럼(예) | 설명 |
  | --- | --- |
  | 종류 / kind | 바닥타일, 벽타일, 양변기, 세면기, 욕조, 샤워부스, 수전, 액세서리 |
  | 이름, 브랜드, 모델코드, 가격, 태그(`;` 구분), 공개 | 공통 |
  | 이미지URL / image_url | 타일은 texture_url, 위생도기는 cutout_url 로 저장 |
  | 가로mm, 세로mm, 줄눈색, 줄눈두께, 마감(무광/새틴/유광) | 타일 |
  | 실제폭, 실제높이, 실제깊이, 설치방식(바닥설치/벽걸이/카운터탑) | 위생도기 |

## 프로젝트와 표면 마스킹 (기능 3-1)

- `/projects/new` — 프로젝트명·고객·주소 + 시공 전 사진(필수) / 실제 시공 후 사진(선택).
  사진은 비공개 `projects` 버킷의 `<uid>/<projectId>/before.jpg` 에 저장되고 화면에서는 1시간짜리 서명 URL 로 표시됩니다.
- `/projects/[id]/mask` — 표면 마스킹 에디터
  - **폴리곤** (P): 클릭으로 꼭짓점 추가, 첫 점 클릭/더블클릭/Enter 로 닫기, 드래그 이동, 우클릭 삭제, C 로 베지어 핸들 토글(둥근 벽)
  - **매직완드** (W): 클릭 지점과 비슷한 색을 flood-fill 로 선택 → 외곽선 추출 → 폴리곤. 허용오차와 **경계 감도**(밝기가 꺾이는 모서리에서 멈춤) 조절
  - **원근 4점** (Q): 실제로 직사각형인 4점(좌상→우상→우하→좌하)을 찍으면 호모그래피로 투영 격자를 보여줍니다
  - 라벨(바닥/정면벽/좌측벽…), 종류, 실제 치수(mm), z-order, 실행취소/재실행 50단계, 휠 확대·Space 드래그 이동, 터치 핀치
  - 저장 시 `surfaces.polygon` 에는 평탄화된 `[[x,y],…]`, `surfaces.quad` 에는 4점, `surfaces.editor` 에는 베지어 핸들 등 편집 상태가 들어갑니다
- 개발 중에는 Supabase 없이 `/dev/mask` 에서 합성 욕실 사진(`pnpm samples:room`)으로 에디터를 시험할 수 있습니다 (프로덕션에서는 404)

## 시뮬레이터와 타일 렌더링 (기능 3-3, 3-4)

- `/projects/[id]` — 좌측 자재 라이브러리(클릭 적용 · **호버 즉시 미리보기**), 중앙 WebGL 캔버스(휠 확대 · 드래그 이동 · 더블클릭 맞춤),
  하단 레이어 패널(표면 선택 · 패턴 · 오프셋 · 회전 · 줄눈 색), 우측 견적 요약(로스율 5~10%)
- 렌더 파이프라인 (`src/lib/render/`)
  1. `tilePattern.ts` — 패턴별(정렬 · 벽돌 1/2 · 1/3 · 헤링본 · 세로쌓기 · 대각선) 셀 배치를 mm 좌표로 계산 (순수 함수, 테스트)
  2. `patternCanvas.ts` — 표면의 mm 바운딩 박스를 Canvas2D 로 정면 뷰 렌더 (줄눈, 타일별 ±3% 밝기, 랜덤 90° 회전)
  3. `renderer.ts` — PixiJS v8 커스텀 메시: 프래그먼트 셰이더가 이미지 픽셀 → 역호모그래피 → mm → 패턴 텍스처를 샘플링(원근 워프),
     폴리곤 마스크(2px 페더) 곱, 이방성 필터·밉맵. dirty flag + rAF 로 변경 없으면 렌더 생략
  4. 텍스처가 디코딩되기 전에는 대표색으로 먼저 그려 즉시 반응하고, 디코딩이 끝나면 교체 (같은 입력이면 같은 결과)
- 개발 중에는 `/dev/sim` 에서 합성 욕실 + 샘플 타일로 Supabase 없이 시험할 수 있습니다
- 개발 서버가 켜진 상태에서 빌드를 검증하려면 `NEXT_DIST_DIR=.next-build pnpm build` (`.next` 를 덮어쓰지 않음)

### 음영(Shading) 합성 — "자연스러움"의 핵심 (기능 3-2)

`src/lib/render/shading.ts` (순수 함수, 테스트)

1. 원본 사진을 Lab 으로 바꿔 L* 채널만 추출
2. 표면 마스크 안에서만 정규화 컨볼루션(3회 박스 블러 ≈ 가우시안, σ = 폭/40) → 저주파 조명 성분 Lb
3. 표면 안 Lb 평균 Lm → `light = Lb / Lm` (평균 1.0, 어두운 곳 0.6, 밝은 곳 1.4, 클램프 0.3~2.0)
4. `detail = (L − Lb) × 0.35` — 타일 표면의 미세 요철감
5. R = light/2, G = detail+0.5, B = 마스크 로 PNG 인코딩 → 마스크 저장 시 `renders` 버킷에 캐시(`surfaces.shading_url`)
6. 셰이더에서 `rgb × light + detail` 로 곱연산, 유광(gloss)은 밝은 영역에 하이라이트를 더하고, 소프트 클립으로 과노출을 막음

`shading_url` 이 없는 표면은 렌더러가 원본 사진에서 즉석 계산하므로(≈30ms) 과거 데이터나 데모 모드에서도 동일하게 동작합니다.
우측 패널의 "원본 조명 합성" 슬라이더로 효과를 0~100% 로 비교할 수 있습니다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 개발 서버 (Turbopack) |
| `pnpm build` / `pnpm start` | 프로덕션 빌드 / 실행 |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest 유닛 테스트 (homography, tilePattern, estimate …) |
| `pnpm db:types` | Supabase 타입 생성 → `src/types/database.types.ts` |
| `pnpm db:push` | 마이그레이션 푸시 (`supabase link` 필요) |
| `pnpm db:new <name>` | 새 마이그레이션 파일 |

## 화면

| 경로 | 설명 |
| --- | --- |
| `/` | 랜딩 |
| `/login` | 이메일 매직링크 + Google OAuth |
| `/projects` | 프로젝트 목록 |
| `/projects/new` | 현장 사진 업로드 → 프로젝트 생성 |
| `/projects/[id]` | ★ 메인 시뮬레이터 |
| `/projects/[id]/mask` | 표면(벽/바닥) 마스킹 에디터 |
| `/materials` | 자재 라이브러리 |
| `/materials/new` | 자재 등록 |
| `/share/[token]` | 공유 뷰어 (읽기 전용, 로그인 불필요) |

## 프로젝트 구조

```
supabase/            config.toml, migrations/, seed.sql
src/app/             App Router 페이지·API
src/components/      canvas/ panels/ materials/ ui/(shadcn)
src/lib/render/      homography, tilePattern, shading, shadow, colorGrade, seamless, renderer
src/lib/supabase/    client / server / middleware
src/store/           Zustand 스토어 (project, scene, history)
src/types/           database.types.ts
tests/               vitest 유닛 테스트
```

## 구현 단계

| Phase | 내용 |
| --- | --- |
| 1 | 스캐폴딩, Supabase 연결, Auth, 마이그레이션, 타입 |
| 2 | 자재 등록·목록 (업로드·썸네일·배경제거) |
| 3 | 프로젝트 생성, 사진 업로드, 마스킹 에디터 |
| 4 | 호모그래피 + 타일 패턴 렌더링 |
| 5 | shadingMap 합성 |
| 6 | Before/After 뷰어 |
| 7 | 조명·채도 셰이더 |
| 8 | 위생도기 배치·자동 스케일·접지 그림자 |
| 9 | 자동 저장, Realtime, undo/redo, 공유, 견적 |
| 10 | GitHub Actions, 배포, 성능 최적화 |
