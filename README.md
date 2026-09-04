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

1. **스키마 생성** — SQL Editor 에서 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) 전체를 실행합니다.
   테이블·RLS·Realtime·Storage 버킷(textures, cutouts, thumbnails, projects, renders)·공유 RPC 가 한 번에 만들어집니다.
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
5. **타입 재생성** — 스키마를 바꿨다면 `pnpm supabase login` 후 `pnpm db:types`

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
