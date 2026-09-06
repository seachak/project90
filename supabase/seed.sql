-- =====================================================================
-- project90 seed — 샘플 타일 22종 + 위생도기 5종
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
  ('00000000-0000-4000-8000-000000000001', 'tile_floor', '화이트 포세린 600각', '샘플', 'SMP-001', '/samples/tiles/white-matte.webp', '/samples/tiles/white-matte.webp', 600, 600, true, '#d8d5d0', 3, 'matte', 0.05, '#ecebe8', 18000, array['화이트','포세린','무광']::text[], '{"hue_bucket":"white","sample":true,"random_rotate":false,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000002', 'tile_floor', '라이트 그레이 600각', '샘플', 'SMP-002', '/samples/tiles/light-gray-matte.webp', '/samples/tiles/light-gray-matte.webp', 600, 600, true, '#d8d5d0', 3, 'matte', 0.05, '#c9c9c7', 18000, array['그레이','무광']::text[], '{"hue_bucket":"gray","sample":true,"random_rotate":false,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000003', 'tile_floor', '다크 그레이 600각', '샘플', 'SMP-003', '/samples/tiles/dark-gray-matte.webp', '/samples/tiles/dark-gray-matte.webp', 600, 600, true, '#d8d5d0', 3, 'matte', 0.05, '#5b5b5d', 19000, array['그레이','무광','모던']::text[], '{"hue_bucket":"gray","sample":true,"random_rotate":false,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000004', 'tile_floor', '샌드 베이지 600각', '샘플', 'SMP-004', '/samples/tiles/sand-beige-matte.webp', '/samples/tiles/sand-beige-matte.webp', 600, 600, true, '#d8d5d0', 3, 'matte', 0.05, '#d5c7b1', 18000, array['베이지','무광','내추럴']::text[], '{"hue_bucket":"beige","sample":true,"random_rotate":false,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000005', 'tile_floor', '카라라 마블 600각 유광', '샘플', 'SMP-005', '/samples/tiles/carrara-marble.webp', '/samples/tiles/carrara-marble.webp', 600, 600, true, '#d8d5d0', 3, 'glossy', 0.45, '#edebe8', 32000, array['대리석','화이트','유광']::text[], '{"hue_bucket":"white","sample":true,"random_rotate":true,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000006', 'tile_wall', '네로 마르퀴나 600×1200 유광', '샘플', 'SMP-006', '/samples/tiles/nero-marble.webp', '/samples/tiles/nero-marble.webp', 600, 1200, true, '#d8d5d0', 3, 'glossy', 0.45, '#27272a', 48000, array['대리석','블랙','유광','럭셔리']::text[], '{"hue_bucket":"black","sample":true,"random_rotate":true,"source_width":384,"source_height":768}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000007', 'tile_floor', '테라조 600각', '샘플', 'SMP-007', '/samples/tiles/terrazzo.webp', '/samples/tiles/terrazzo.webp', 600, 600, true, '#d8d5d0', 3, 'satin', 0.2, '#d6d2cb', 36000, array['테라조','레트로']::text[], '{"hue_bucket":"beige","sample":true,"random_rotate":true,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000008', 'tile_wall', '콘크리트 600×1200', '샘플', 'SMP-008', '/samples/tiles/concrete.webp', '/samples/tiles/concrete.webp', 600, 1200, true, '#d8d5d0', 3, 'matte', 0.05, '#9f9f9d', 42000, array['콘크리트','그레이','인더스트리얼']::text[], '{"hue_bucket":"gray","sample":true,"random_rotate":false,"source_width":384,"source_height":768}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000009', 'tile_floor', '오크 우드 플랭크 200×1200', '샘플', 'SMP-009', '/samples/tiles/oak-plank.webp', '/samples/tiles/oak-plank.webp', 200, 1200, true, '#d8d5d0', 3, 'matte', 0.05, '#bb9668', 26000, array['우드','오크','플랭크']::text[], '{"hue_bucket":"beige","sample":true,"random_rotate":false,"source_width":128,"source_height":768}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000010', 'tile_floor', '월넛 우드 플랭크 150×900', '샘플', 'SMP-010', '/samples/tiles/walnut-plank.webp', '/samples/tiles/walnut-plank.webp', 150, 900, true, '#d8d5d0', 3, 'matte', 0.05, '#6f4d36', 24000, array['우드','월넛','플랭크']::text[], '{"hue_bucket":"brown","sample":true,"random_rotate":false,"source_width":128,"source_height":768}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000011', 'tile_wall', '서브웨이 화이트 150×75 유광', '샘플', 'SMP-011', '/samples/tiles/subway-white.webp', '/samples/tiles/subway-white.webp', 150, 75, true, '#cfcbc4', 2, 'glossy', 0.45, '#f6f6f4', 9000, array['서브웨이','화이트','유광']::text[], '{"hue_bucket":"white","sample":true,"random_rotate":false,"source_width":512,"source_height":256}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000012', 'tile_wall', '서브웨이 세이지 300×100 유광', '샘플', 'SMP-012', '/samples/tiles/subway-sage.webp', '/samples/tiles/subway-sage.webp', 300, 100, true, '#d9d5ce', 2, 'glossy', 0.45, '#b0beac', 11000, array['서브웨이','그린','유광']::text[], '{"hue_bucket":"green","sample":true,"random_rotate":false,"source_width":768,"source_height":256}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000013', 'tile_wall', '화이트 모자이크 300×300 (25각)', '샘플', 'SMP-013', '/samples/tiles/mosaic-white.webp', '/samples/tiles/mosaic-white.webp', 300, 300, true, '#cdcac4', 3, 'glossy', 0.45, '#cdcdcb', 15000, array['모자이크','화이트']::text[], '{"hue_bucket":"gray","sample":true,"random_rotate":false,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000014', 'tile_floor', '테라코타 300각', '샘플', 'SMP-014', '/samples/tiles/terracotta.webp', '/samples/tiles/terracotta.webp', 300, 300, true, '#d8d5d0', 3, 'matte', 0.05, '#c26e4c', 14000, array['테라코타','브라운','내추럴']::text[], '{"hue_bucket":"brown","sample":true,"random_rotate":false,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000015', 'tile_wall', '네이비 300×600 유광', '샘플', 'SMP-015', '/samples/tiles/navy-gloss.webp', '/samples/tiles/navy-gloss.webp', 300, 600, true, '#d8d5d0', 3, 'glossy', 0.45, '#253b63', 16000, array['네이비','블루','유광']::text[], '{"hue_bucket":"blue","sample":true,"random_rotate":false,"source_width":256,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000016', 'tile_wall', '세이지 그린 300×600 새틴', '샘플', 'SMP-016', '/samples/tiles/sage-satin.webp', '/samples/tiles/sage-satin.webp', 300, 600, true, '#d8d5d0', 3, 'satin', 0.2, '#96aa96', 16000, array['그린','세이지','새틴']::text[], '{"hue_bucket":"green","sample":true,"random_rotate":false,"source_width":256,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000017', 'tile_floor', '트래버틴 베이지 600각', '샘플', 'SMP-017', '/samples/tiles/travertine.webp', '/samples/tiles/travertine.webp', 600, 600, true, '#d8d5d0', 3, 'satin', 0.2, '#deceb2', 34000, array['트래버틴','베이지','내추럴']::text[], '{"hue_bucket":"beige","sample":true,"random_rotate":true,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000018', 'tile_floor', '슬레이트 블랙 300×600', '샘플', 'SMP-018', '/samples/tiles/slate-black.webp', '/samples/tiles/slate-black.webp', 300, 600, true, '#d8d5d0', 3, 'matte', 0.05, '#333539', 22000, array['슬레이트','블랙','무광']::text[], '{"hue_bucket":"gray","sample":true,"random_rotate":false,"source_width":256,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000019', 'tile_wall', '블러시 핑크 200각 새틴', '샘플', 'SMP-019', '/samples/tiles/blush-satin.webp', '/samples/tiles/blush-satin.webp', 200, 200, true, '#d8d5d0', 3, 'satin', 0.2, '#e2bebe', 12000, array['핑크','새틴','파스텔']::text[], '{"hue_bucket":"pink","sample":true,"random_rotate":false,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000020', 'tile_floor', '크림 300각', '샘플', 'SMP-020', '/samples/tiles/cream-matte.webp', '/samples/tiles/cream-matte.webp', 300, 300, true, '#d8d5d0', 3, 'matte', 0.05, '#eee6d4', 13000, array['크림','베이지','무광']::text[], '{"hue_bucket":"beige","sample":true,"random_rotate":false,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000021', 'tile_wall', '그레이 마블 600각 유광', '샘플', 'SMP-021', '/samples/tiles/gray-marble.webp', '/samples/tiles/gray-marble.webp', 600, 600, true, '#d8d5d0', 3, 'glossy', 0.45, '#ccccce', 30000, array['대리석','그레이','유광']::text[], '{"hue_bucket":"gray","sample":true,"random_rotate":true,"source_width":512,"source_height":512}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000022', 'tile_wall', '차콜 600×1200 무광', '샘플', 'SMP-022', '/samples/tiles/charcoal-large.webp', '/samples/tiles/charcoal-large.webp', 600, 1200, true, '#d8d5d0', 3, 'matte', 0.05, '#454547', 44000, array['차콜','블랙','무광','대형']::text[], '{"hue_bucket":"gray","sample":true,"random_rotate":false,"source_width":384,"source_height":768}'::jsonb, true, null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000051', 'toilet', '원피스 양변기 화이트', '샘플', 'SMP-051', null, '/samples/fixtures/toilet-white.png', null, null, true, null, null, 'glossy', 0.45, '#eef0f1', 320000, array['양변기','원피스','화이트']::text[], '{"sample":true,"source_width":420,"source_height":720}'::jsonb, true, '/samples/fixtures/toilet-white.png', 0.5, 0.985, 380, 760, 700, 'floor'),
  ('00000000-0000-4000-8000-000000000052', 'basin', '벽걸이 세면기 600', '샘플', 'SMP-052', null, '/samples/fixtures/basin-wall.png', null, null, true, null, null, 'glossy', 0.45, '#eef0f1', 210000, array['세면기','벽걸이','화이트']::text[], '{"sample":true,"source_width":620,"source_height":380}'::jsonb, true, '/samples/fixtures/basin-wall.png', 0.5, 0.9, 600, 370, 450, 'wall'),
  ('00000000-0000-4000-8000-000000000053', 'bathtub', '매립형 욕조 1700', '샘플', 'SMP-053', null, '/samples/fixtures/bathtub-white.png', null, null, true, null, null, 'glossy', 0.45, '#eef0f1', 680000, array['욕조','1700','화이트']::text[], '{"sample":true,"source_width":900,"source_height":340}'::jsonb, true, '/samples/fixtures/bathtub-white.png', 0.5, 0.97, 1700, 600, 750, 'floor'),
  ('00000000-0000-4000-8000-000000000054', 'faucet', '벽붙이 수전 크롬', '샘플', 'SMP-054', null, '/samples/fixtures/faucet-chrome.png', null, null, true, null, null, 'glossy', 0.45, '#eef0f1', 89000, array['수전','크롬','벽붙이']::text[], '{"sample":true,"source_width":260,"source_height":300}'::jsonb, true, '/samples/fixtures/faucet-chrome.png', 0.2, 0.5, 220, 250, 180, 'wall'),
  ('00000000-0000-4000-8000-000000000055', 'shower', '해바라기 샤워 세트', '샘플', 'SMP-055', null, '/samples/fixtures/shower-rain.png', null, null, true, null, null, 'glossy', 0.45, '#eef0f1', 240000, array['샤워','해바라기','크롬']::text[], '{"sample":true,"source_width":300,"source_height":620}'::jsonb, true, '/samples/fixtures/shower-rain.png', 0.5, 0.08, 300, 1250, 380, 'wall')
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
