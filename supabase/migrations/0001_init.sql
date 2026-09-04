-- =====================================================================
-- project90 — 욕실·주방 리모델링 타일/위생도기 시뮬레이터
-- 0001_init.sql : 초기 스키마 (Supabase SQL Editor에 그대로 실행 가능)
-- =====================================================================

-- ========== 확장 ==========
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ========== 1. 자재 카테고리 ==========
create type material_kind as enum (
  'tile_floor',      -- 바닥 타일
  'tile_wall',       -- 벽 타일
  'toilet',          -- 변기
  'basin',           -- 세면기
  'bathtub',         -- 욕조
  'shower',          -- 샤워부스/수전
  'faucet',          -- 수전
  'accessory'        -- 액세서리(수건걸이 등)
);

-- ========== 2. 자재 마스터 ==========
create table public.materials (
  id              uuid primary key default gen_random_uuid(),
  kind            material_kind not null,
  name            text not null,
  brand           text,
  model_code      text,
  -- 텍스처(타일) 정보
  texture_url     text,                  -- Storage public URL
  thumbnail_url   text,
  tile_width_mm   integer,               -- 실제 타일 1장 가로(mm)
  tile_height_mm  integer,               -- 실제 타일 1장 세로(mm)
  is_seamless     boolean default true,  -- 타일링 이음매 없는 텍스처인지
  grout_color     text default '#d8d5d0',-- 줄눈 색
  grout_width_mm  numeric default 3,
  -- 위생도기(오브젝트) 정보
  cutout_url      text,                  -- 배경 제거된 PNG (알파 채널)
  anchor_x        numeric,               -- 0~1, 오브젝트 바닥 접지점 X
  anchor_y        numeric,               -- 0~1, 오브젝트 바닥 접지점 Y
  real_width_mm   integer,               -- 실제 폭
  real_height_mm  integer,               -- 실제 높이
  real_depth_mm   integer,
  mount_type      text,                  -- 'floor' | 'wall' | 'countertop'
  -- 공통
  finish          text,                  -- 'matte' | 'glossy' | 'satin'
  gloss           numeric default 0.2,   -- 0~1, 하이라이트 강도
  base_color      text,                  -- 대표색 HEX (팔레트/필터용)
  price           numeric,
  currency        text default 'KRW',
  tags            text[] default '{}',
  meta            jsonb default '{}'::jsonb,
  owner_id        uuid references auth.users(id) on delete set null,
  is_public       boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index on public.materials (kind);
create index on public.materials (owner_id);
create index on public.materials using gin (tags);

-- ========== 3. 프로젝트(현장) ==========
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  client_name   text,
  address       text,
  before_url    text,          -- 시공 전 사진
  after_url     text,          -- 실제 시공 후 사진(있으면)
  base_url      text,          -- 시뮬레이션 기준 이미지(보통 before)
  width_px      integer,
  height_px     integer,
  -- 카메라/원근 보정 파라미터
  camera        jsonb default '{}'::jsonb,
  owner_id      uuid references auth.users(id) on delete cascade,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index on public.projects (owner_id);

-- ========== 4. 표면(벽/바닥) 영역 정의 ==========
create table public.surfaces (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  label         text not null,            -- '좌측벽','바닥','정면벽'
  surface_type  text not null,            -- 'floor' | 'wall' | 'ceiling'
  -- 마스크: 폴리곤 좌표 배열 [[x,y],...] (원본 이미지 픽셀 기준)
  polygon       jsonb not null,
  -- 원근 변환용 4점 (좌상,우상,우하,좌하) — 타일 격자 투영에 사용
  quad          jsonb not null,
  -- 실제 치수 (mm) — 타일 매수 계산용
  real_width_mm  integer,
  real_height_mm integer,
  -- 원본 사진의 명암 정보를 뽑아둔 러프니스/AO 맵
  shading_url   text,
  z_order       integer default 0,
  created_at    timestamptz default now()
);
create index on public.surfaces (project_id);

-- ========== 5. 배치된 자재 (시뮬레이션 상태) ==========
create table public.placements (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  material_id   uuid not null references public.materials(id) on delete restrict,
  surface_id    uuid references public.surfaces(id) on delete cascade,  -- 타일일 때
  -- 오브젝트(위생도기)일 때의 배치 정보
  pos_x         numeric,     -- 0~1 정규화 좌표
  pos_y         numeric,
  scale         numeric default 1,
  rotation      numeric default 0,
  flip_x        boolean default false,
  -- 타일일 때의 배치 정보
  pattern       text default 'grid',  -- 'grid'|'brick'|'brick_1_3'|'herringbone'|'stack'|'diagonal'
  offset_x_mm   numeric default 0,
  offset_y_mm   numeric default 0,
  rotate_deg    numeric default 0,
  grout_override text,
  z_order       integer default 0,
  created_at    timestamptz default now()
);
create index on public.placements (project_id);

-- ========== 6. 씬 프리셋(조명/채도 등 전역 보정) ==========
create table public.scene_settings (
  project_id    uuid primary key references public.projects(id) on delete cascade,
  brightness    numeric default 1.0,   -- 0.5 ~ 1.5
  contrast      numeric default 1.0,
  saturation    numeric default 1.0,   -- 0 ~ 2
  temperature   numeric default 0,     -- -100(cool) ~ +100(warm), 켈빈 매핑
  tint          numeric default 0,     -- -100(green) ~ +100(magenta)
  exposure      numeric default 0,
  shadow_lift   numeric default 0,
  light_preset  text default 'daylight',-- 'daylight'|'warm'|'cool'|'night'|'showroom'
  vignette      numeric default 0,
  updated_at    timestamptz default now()
);

-- ========== 7. 저장된 스냅샷(공유용) ==========
create table public.snapshots (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  title         text,
  image_url     text,           -- 렌더 결과 PNG
  state         jsonb not null, -- placements + scene_settings 전체 스냅샷
  share_token   text unique default encode(gen_random_bytes(12),'hex'),
  created_at    timestamptz default now()
);
create index on public.snapshots (project_id);

-- ========== updated_at 자동 갱신 ==========
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_materials_touch before update on public.materials
  for each row execute function public.touch_updated_at();
create trigger t_projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger t_scene_touch before update on public.scene_settings
  for each row execute function public.touch_updated_at();

-- ========== RLS ==========
alter table public.materials      enable row level security;
alter table public.projects       enable row level security;
alter table public.surfaces       enable row level security;
alter table public.placements     enable row level security;
alter table public.scene_settings enable row level security;
alter table public.snapshots      enable row level security;

-- materials: 공개 자재는 누구나 읽기, 내 자재는 전권
create policy "materials_read" on public.materials
  for select using (is_public or owner_id = auth.uid());
create policy "materials_write" on public.materials
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- projects: 소유자만
create policy "projects_owner" on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 자식 테이블: 부모 프로젝트 소유자만
create policy "surfaces_owner" on public.surfaces for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "placements_owner" on public.placements for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "scene_owner" on public.scene_settings for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

-- snapshots: 소유자 전권 + share_token 으로 공개 조회는 RPC 경유
create policy "snapshots_owner" on public.snapshots for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

-- ========== 공유 뷰어용 RPC (로그인 불필요, share_token 으로만 조회) ==========
create or replace function public.get_shared_snapshot(p_token text)
returns table (
  id           uuid,
  title        text,
  image_url    text,
  state        jsonb,
  created_at   timestamptz,
  project_name text,
  width_px     integer,
  height_px    integer
)
language sql
security definer
stable
set search_path = public
as $$
  select s.id, s.title, s.image_url, s.state, s.created_at,
         p.name, p.width_px, p.height_px
  from public.snapshots s
  join public.projects p on p.id = s.project_id
  where s.share_token = p_token
  limit 1
$$;
revoke all on function public.get_shared_snapshot(text) from public;
grant execute on function public.get_shared_snapshot(text) to anon, authenticated;

-- ========== Realtime ==========
alter publication supabase_realtime add table public.placements;
alter publication supabase_realtime add table public.scene_settings;

-- =====================================================================
-- Storage 버킷
--   textures   public   타일 텍스처 원본·타일링용
--   cutouts    public   위생도기 배경제거 PNG
--   thumbnails public   목록용 썸네일 (400px)
--   projects   private  현장 before/after 사진
--   renders    public   스냅샷 렌더 결과 · shading map 캐시
-- 파일 경로 규칙: <uid>/<...> — 첫 폴더가 업로더 uid (소유권 판정용)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('textures','textures',true),
       ('cutouts','cutouts',true),
       ('thumbnails','thumbnails',true),
       ('projects','projects',false),
       ('renders','renders',true)
on conflict (id) do nothing;

-- 공개 버킷: 누구나 읽기
create policy "public read textures" on storage.objects for select
  using (bucket_id in ('textures','cutouts','thumbnails','renders'));

-- 공개 버킷: 로그인 사용자는 업로드 가능
create policy "auth upload textures" on storage.objects for insert
  to authenticated with check (bucket_id in ('textures','cutouts','thumbnails','renders'));

-- 공개 버킷: 파일 경로 첫 폴더가 본인 uid 인 파일만 수정/삭제
create policy "own public files update" on storage.objects for update
  to authenticated
  using (bucket_id in ('textures','cutouts','thumbnails','renders')
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own public files delete" on storage.objects for delete
  to authenticated
  using (bucket_id in ('textures','cutouts','thumbnails','renders')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- 비공개 projects 버킷: <uid>/... 경로만 본인이 전권
create policy "own project files" on storage.objects for all
  to authenticated
  using (bucket_id = 'projects' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'projects' and (storage.foldername(name))[1] = auth.uid()::text);
