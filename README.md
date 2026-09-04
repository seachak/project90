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
