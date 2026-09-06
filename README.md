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

### 1. Node.js 22 설치 (먼저 해야 합니다)

`pnpm` 도 `corepack` 도 **Node.js를 깔아야 생기는 도구**입니다.
Node 없이 `pnpm`/`corepack` 을 치면 "내부 또는 외부 명령이 아닙니다" 만 계속 나옵니다.

| 환경 | 설치 |
| --- | --- |
| Windows | `winget install OpenJS.NodeJS.LTS` — winget 이 없으면 <https://nodejs.org> 의 **LTS** 설치 파일 |
| macOS | `brew install node@22` |
| Linux | 배포판 패키지 또는 [nvm](https://github.com/nvm-sh/nvm) |

> ⚠️ **설치가 끝나면 터미널을 닫고 새로 여세요.** PATH 는 새 터미널에만 반영됩니다.
> 이 단계를 건너뛰면 설치해도 계속 "명령이 아닙니다" 가 뜹니다.

확인:

```bash
node -v
```

`v22.x.x` 가 나오면 됩니다 (`.node-version` 참고).

### 2. pnpm 9 설치

```bash
npm i -g pnpm@9.15.9
pnpm -v
```

Node 16.9+ 에 내장된 corepack (`corepack enable && corepack prepare pnpm@9.15.9 --activate`) 을 써도 되지만,
Windows 에서는 권한 문제로 걸리는 경우가 있어 위의 `npm i -g` 쪽이 실패가 적습니다.

### 3. 의존성 설치와 샘플 생성

```bash
pnpm install
pnpm samples:gen
pnpm samples:room
```

`samples:gen` 은 샘플 타일 22종과 위생도기 컷아웃 5종을, `samples:room` 은 데모 욕실 사진을 만듭니다.
둘 다 처음 한 번만 실행하면 됩니다.

### 4. Supabase 없이 바로 확인하기

환경변수나 DB 설정 없이도 렌더링·도기 배치·조명을 전부 볼 수 있고,
**내 실물 자재를 등록해 바로 얹어볼 수도 있습니다.**

```bash
pnpm dev
```

- **<http://localhost:3000/dev/sim>** — 합성 욕실 + 샘플 자재로 시뮬레이터 전체
- **<http://localhost:3000/dev/mask>** — 표면 마스킹 에디터

- **<http://localhost:3000/materials/new>** — 실물 자재 등록 (로컬 모드)

터미널 창은 켜 둔 채로 두세요 (종료는 `Ctrl+C`).
`/dev/*` 는 **개발 모드 전용**이라 `pnpm build && pnpm start` 나 배포본에서는 404 입니다.

#### 로컬 모드 — Supabase 없이 내 사진 + 내 자재

`.env.local` 이 없으면 앱이 자동으로 **로컬 모드**로 동작합니다. 계정도 SQL 실행도 필요 없고,
사진·자재·배치가 전부 **이 브라우저의 IndexedDB** 에 저장됩니다. URL 은 Supabase 경로와 같습니다.

| 화면 | 로컬 모드에서 |
| --- | --- |
| `/materials/new` | 자재 등록 → IndexedDB. 이음매 검사·3×3 미리보기·배경 제거 그대로. 썸네일만 서버(sharp) 대신 캔버스로 |
| `/materials` | 등록한 자재 목록. 카드를 클릭하면 삭제 |
| `/projects/new` | 내 현장 사진 업로드 → 바로 마스킹 화면으로 |
| `/projects/[id]/mask` | 폴리곤·매직완드·원근 4점 그대로. 저장하면 IndexedDB 로 |
| `/projects/[id]` | 시뮬레이터. 자재 적용·조명·Before/After·PNG 내보내기 모두 동작하고 변경은 자동 저장됩니다 |

서버 컴포넌트는 IndexedDB 를 읽을 수 없으므로, 각 라우트가 `hasSupabaseEnv()` 로 분기해
`src/components/projects/LocalProjects.tsx` 의 클라이언트 화면으로 넘어갑니다.
표면은 DB 행과 같은 모양(`SurfaceInsert`)으로 저장해 `surfaceToRow` / `toRenderSurface` /
`toEditableSurface` 를 Supabase 경로와 똑같이 재사용합니다.

**로컬 모드에서 안 되는 것**: 공유 링크(`/share/[token]`)는 서버 Storage 가 필요합니다 —
결과를 남기려면 PNG 다운로드를 쓰세요.

⚠️ **이 브라우저에만 남습니다.** 다른 기기·다른 브라우저에서는 보이지 않고, 사이트 데이터를 지우면
사라집니다. 여러 사람이 함께 쓰거나 링크로 공유하려면 Supabase 를 연결하세요.

내 현장 사진 업로드·자재 등록·저장·공유까지 쓰려면 아래 환경변수와 Supabase 설정이 필요합니다.

```bash
cp .env.local.example .env.local
```

### 문제가 생기면

| 증상 | 원인과 해결 |
| --- | --- |
| `'corepack'/'pnpm'은(는) 내부 또는 외부 명령...` | Node 미설치, 또는 설치 후 터미널을 새로 열지 않음. 1단계부터 다시 |
| 예시 명령을 붙여넣었더니 이상하게 동작 | Windows CMD 에서 `#` 는 주석이 아니라 인자로 넘어갑니다. 코드블록의 명령만 복사하세요 |
| `pnpm install` 이 `cdn.sheetjs.com ... 403` 으로 중단 | `xlsx` 를 npm 레지스트리가 아닌 SheetJS CDN 에서 받아오는데 그 호스트가 막힌 망입니다. `package.json` 의 `"xlsx"` 값을 `"0.18.5"` 로 바꾸고 다시 설치하세요 (CSV/엑셀 일괄 등록에서 `XLSX.read`·`utils.sheet_to_json` 만 쓰므로 동작은 같습니다) |
| 캔버스가 검게만 나옴 | WebGL2 를 지원하는 브라우저가 필요합니다. 하드웨어 가속이 꺼져 있지 않은지 확인하세요 |

### 환경변수 (`.env.local`)

| 변수 | 얻는 곳 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jxmwamgfgqqsedhjvpwn.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 대시보드 → Settings → API → `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면의 `service_role` (서버 전용, 절대 커밋 금지) |
| `SUPABASE_PROJECT_REF` | `jxmwamgfgqqsedhjvpwn` |
| `NEXT_PUBLIC_SITE_URL` | 로컬 `http://localhost:3000`, 배포 시 Vercel 도메인 |
| `NEXT_PUBLIC_GUEST_MATERIALS` | (선택) `1` 이면 로그인 없이 자재 등록 — 아래 참고 |

`.env*.local` 은 `.gitignore` 에 포함되어 있습니다.

#### 게스트 자재 등록 (임시)

`NEXT_PUBLIC_GUEST_MATERIALS=1` 로 켜면 로그인 없이 `/materials` 에서 자재를 등록할 수 있습니다.
RLS 와 Storage 정책은 그대로 두고 서버 라우트(`/api/materials/guest`)에서만 `service_role` 로 우회하므로
DB 정책 자체는 안전하지만, **공개된 주소에 켜 두면 누구나 자재를 올릴 수 있는 열린 업로드 경로**가 됩니다.
로컬에서 임시로 확인하는 용도이며 기본값은 꺼짐입니다. 켜려면 `SUPABASE_SERVICE_ROLE_KEY` 도 필요합니다.
게스트 자재는 `owner_id` 없이 **공개 자재**로 저장됩니다(익명 조회 정책이 공개 자재만 허용).

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
5. **샘플 자재 적재 (선택)** — SQL Editor 에서 [`supabase/seed.sql`](supabase/seed.sql) 실행.
   절차적으로 생성한 타일 텍스처 22종(`public/samples/tiles/`)과 위생도기 컷아웃 5종(`public/samples/fixtures/`)이
   공개 자재로 들어갑니다. 재실행해도 안전합니다(upsert).
   텍스처와 위생도기 컷아웃을 다시 만들려면 `pnpm samples:gen`.
6. **타입 재생성** — 스키마를 바꿨다면 `pnpm supabase login` 후 `pnpm db:types`

## 자재 등록 (기능 1)

- `/materials/new` — 종류 선택 → 이미지 드래그&드롭(여러 장) → 자동 분석
  - 타일: 규격 프리셋, 줄눈 색/두께, 마감(무광 0.05 / 새틴 0.2 / 유광 0.45), **이음매 자동 검사**(가장자리 픽셀 차 ÷ 내부 인접 픽셀 차),
    이음매가 있으면 거울 반복 / 오프셋 블렌드 보정, 3×3 타일링 미리보기(타일별 ±1.5% 밝기 편차, 줄눈 그늘, 랜덤 90° 회전 — 시뮬레이터와 같은 규칙)
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
  2. `patternCanvas.ts` — 표면의 mm 바운딩 박스를 Canvas2D 로 정면 뷰 렌더 (줄눈 + 가장자리 그늘, 타일별 ±1.5% 밝기 편차는 `ctx.filter` 로 색·채도 보존, 랜덤 90° 회전). 한 변 최대 4096px(저사양·모바일 2048)
  3. `renderer.ts` — PixiJS v8 커스텀 메시: 프래그먼트 셰이더가 이미지 픽셀 → 역호모그래피 → mm → 패턴 텍스처를 샘플링(원근 워프),
     폴리곤 마스크(2px 페더) 곱, 이방성 필터·밉맵. dirty flag + rAF 로 변경 없으면 렌더 생략
  4. 텍스처가 디코딩되기 전에는 대표색으로 먼저 그려 즉시 반응하고, 디코딩이 끝나면 교체 (같은 입력이면 같은 결과)
- 개발 중에는 `/dev/sim` 에서 합성 욕실 + 샘플 타일로 Supabase 없이 시험할 수 있습니다
- 개발 서버가 켜진 상태에서 빌드를 검증하려면 `NEXT_DIST_DIR=.next-build pnpm build` (`.next` 를 덮어쓰지 않음)

### Before / After 비교 (기능 2)

헤더의 **[BEFORE] [AFTER] [슬라이더] [분할] [실제 시공본]** 토글 (`ViewModeBar`) 과 `BeforeAfterViewer`.

- 원본 사진 레이어를 시뮬레이션 위에 **항상 겹쳐 두고 opacity/마스크만** 바꾸므로 전환 시 깜빡임·위치 어긋남이 없습니다
- 버튼 토글: 200ms 크로스페이드 · 단축키 **B / A** · **Space 를 누르는 동안** 임시로 BEFORE (사진 편집 앱의 "원본 보기")
- 슬라이더: 세로 구분선을 마우스·터치로 드래그 (스텐실 마스크), 방향키 미세 조정
- 분할: 좌 BEFORE / 우 AFTER 나란히 — 줌·팬이 두 뷰에 완전히 동기화
- 실제 시공본: `projects.after_url` 이 있으면 탭이 추가됩니다

### 조명 · 채도 조절 (기능 4)

우측 패널 `SceneControls` — 모든 항목은 씬 전체(원본 사진 + 타일 + 오브젝트)에 WebGL 프래그먼트 셰이더 1패스(`ColorGradeFilter`)로 실시간 적용됩니다.

| 항목 | 범위 | 비고 |
| --- | --- | --- |
| 밝기 | 0.5 ~ 1.5 | |
| 노출 | -2 ~ +2 EV | `exp2(EV)` |
| 대비 | 0.5 ~ 1.5 | |
| 채도 | 0 ~ 2 | 0 이면 흑백 |
| 색온도 | 2700K ~ 7500K | 흑체 색온도→RGB 게인(휘도 보존), 5500K = 보정 없음. DB 에는 -100(cool)~+100(warm) 로 저장 |
| 색조 | -100(녹) ~ +100(마젠타) | |
| 그림자 복원 | 0 ~ 1 | 어두운 부분만 들어올림 |
| 비네팅 | 0 ~ 1 | |

- 프리셋 원클릭: ☀️ 자연광(5500K) · 💡 전구색(2900K, 채도 1.05, 그림자 +0.1) · ❄️ 주광색(6500K) · 🌙 야간(3000K, 밝기 0.7, 대비 1.15) · 🏢 쇼룸(5000K, 밝기 1.1, 대비 1.1, 채도 1.15)
- 슬라이더마다 숫자 입력 필드 병행(키보드 조작), **더블클릭으로 기본값 리셋**, "원본과 비교" 버튼(누르는 동안 보정 전), 내 프리셋 저장/적용/삭제(localStorage)
- 순수 로직 `src/lib/render/colorGrade.ts` (켈빈 변환, 프리셋, 유니폼 계산)에 테스트가 있습니다

### 위생도기 배치 — 자동 스케일 · 접지 그림자 (기능 3-5)

사진 속 도기 크기를 **사용자가 맞추지 않는다.** 자재 라이브러리에서 양변기를 클릭하면 바닥에 놓이고,
드래그로 옮기면 원근에 맞춰 크기가 따라 변한다.

1. 접지점을 바닥 표면의 역호모그래피로 되돌려 mm 좌표를 구한다
2. 그 지점에서 `localScale()` (야코비안 특이값 근사)로 **px/mm 배율**을 구한다
3. `화면 폭 = 자재의 실제 폭(mm) × 배율 × 미세조정(기본 1.0)`

`src/lib/render/fixture.ts` 가 순수 함수로 이 계산과 앵커 역산·설치 높이·그림자 타원을 담당한다(테스트 있음).

- **앵커**: 자재 등록 시 `AnchorPicker` 로 찍은 `anchor_x/anchor_y` 가 컷아웃 안에서 바닥에 닿는 지점.
  기본값은 하단 중앙 (0.5, 1.0)
- **설치 높이**: `mount_type` 이 `wall`/`countertop` 이면 종류별 표준 높이(세면기 800, 수전 1000, 샤워 1100mm)만큼
  접지점에서 들어올린다
- **접지 그림자**: 방사형 그라디언트를 `multiply` 로 깔고, 바닥면 단축률(`sy/sx`)만큼 눌러 원근을 따라가게 한다.
  벽걸이는 더 작고 옅게. 이게 없으면 도기가 공중에 뜬 것처럼 보인다
- **색온도 일치**: `objectRoot` 가 `world` 안에 있고 `ColorGradeFilter` 는 `app.stage` 에 걸려 있어
  원본 사진·타일·도기·그림자가 **한 패스로 같은 보정**을 받는다
- **선택/이동**: 컷아웃 알파 그리드(64²) 히트테스트라 실루엣 안을 눌러야 잡힌다.
  드래그는 잡은 지점과 접지점의 차를 유지하고, 방향키로 1px(Shift 10px) 미세이동, Delete 로 삭제
- 데모용 도기 5종(양변기·세면기·욕조·수전·샤워)은 `pnpm samples:gen` 이 알파 PNG 로 생성한다

### 저장 · 공유 · 내보내기 (기능 5)

- **자동 저장**: 배치와 조명 변경을 800ms 디바운스로 `placements` / `scene_settings` 에 저장.
  헤더에 `HH:MM 저장됨` 표시, 저장 중 들어온 변경은 끝나고 한 번 더 반영
- **실행취소/다시실행**: 배치 50단계 (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y). 드래그는 시작 시점에만 기록
- **PNG 내보내기**: 카메라를 원점·배율 1 로 두고 **원본 해상도**로 한 프레임만 렌더 → `extract` → PNG.
  조명 보정이 그대로 담기고 선택 테두리는 빠진다
- **공유 링크**: 결과 PNG 를 public `renders` 버킷에 올리고 `snapshots` 에 자기완결적 state 를 저장 →
  `/share/[token]` 은 로그인 없이 `get_shared_snapshot` RPC 로 조회한다.
  공유 뷰어는 익명이라 RLS 로 비공개 자재를 못 읽으므로 쓰인 자재·표면·견적을 state 안에 함께 담는다.
  **원본 현장 사진(private `projects` 버킷)은 공유 경로에 노출되지 않는다**
- **견적**: 표면 폴리곤을 역호모그래피로 mm 평면에 펴서 **실제 시공 면적**을 계산한다
  (바깥 사각형 기준이면 ㄱ자 바닥이 과대 산정된다). 위생도기는 개수 단위로 합산

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
| `pnpm samples:gen` | 샘플 타일 텍스처 + 위생도기 컷아웃 생성 (`seed.sql`·`manifest.json` 갱신) |
| `pnpm samples:room` | 데모용 합성 욕실 사진 생성 |

`push`/PR 마다 GitHub Actions(`.github/workflows/ci.yml`)가 typecheck → lint → test → build 를 돌린다.

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

### 반응형

- `lg` 이상: 좌 자재 · 중앙 캔버스 + 레이어 바 · 우 조명/견적 3단
- `lg` 미만: 캔버스가 화면을 최대한 쓰고, 하단 탭바(`자재 · 레이어 · 조명 · 견적`) → 바텀시트로 전환.
  Before/After 토글은 캔버스 위 오버레이로 내려온다. 375px 에서 가로 스크롤 없이 동작
- 터치: 한 손가락 팬·도기 드래그, 두 손가락 핀치 줌, 더블탭(더블클릭) 맞춤
- 접근성: 모든 토글·슬라이더에 `aria-label`, Before/After 는 **←/→** 및 B/A/Space,
  와이프 핸들은 `role="slider"` + 방향키

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
| 9 | 자동 저장, undo/redo, PNG 내보내기, 공유 링크, 견적 정확도 |
| 10 | 모바일 바텀시트, 텍스처 LRU, 접근성, GitHub Actions |
