-- =====================================================================
-- 0002_surface_editor.sql
-- 마스킹 에디터의 편집 상태(베지어 핸들, 매직완드 파라미터 등)를 보존하기 위한 컬럼.
-- surfaces.polygon 은 계속 렌더러용 평탄화된 [[x,y],...] 를 저장한다.
-- =====================================================================
alter table public.surfaces
  add column if not exists editor jsonb default '{}'::jsonb;

comment on column public.surfaces.editor is
  '에디터 상태: { vertices: [{x,y,in?,out?}], closed, source: polygon|wand, quad_auto }';
