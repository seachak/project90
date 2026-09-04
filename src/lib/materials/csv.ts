/**
 * CSV / 엑셀 일괄 등록 파서.
 * 헤더는 한국어·영어 모두 허용하며, 이미지 URL 컬럼을 포함한다.
 */
import type { MaterialInsert, MaterialKind, Finish, MountType } from "@/types/material";
import { ALL_KINDS, FINISH_GLOSS } from "@/types/material";
import { hueBucketOf } from "@/lib/image/palette";

export type CsvField =
  | "kind"
  | "name"
  | "brand"
  | "model_code"
  | "texture_url"
  | "cutout_url"
  | "thumbnail_url"
  | "tile_width_mm"
  | "tile_height_mm"
  | "grout_color"
  | "grout_width_mm"
  | "finish"
  | "real_width_mm"
  | "real_height_mm"
  | "real_depth_mm"
  | "mount_type"
  | "anchor_x"
  | "anchor_y"
  | "price"
  | "tags"
  | "base_color"
  | "is_public";

const HEADER_ALIASES: Record<CsvField, string[]> = {
  kind: ["kind", "종류", "카테고리", "구분"],
  name: ["name", "이름", "제품명", "자재명", "품명"],
  brand: ["brand", "브랜드", "제조사"],
  model_code: ["model_code", "model", "모델코드", "모델", "품번"],
  texture_url: ["texture_url", "image_url", "이미지url", "이미지 url", "텍스처url", "이미지", "image"],
  cutout_url: ["cutout_url", "컷아웃url", "누끼url", "배경제거url"],
  thumbnail_url: ["thumbnail_url", "썸네일url", "썸네일"],
  tile_width_mm: ["tile_width_mm", "width_mm", "가로", "가로mm", "타일가로", "가로(mm)"],
  tile_height_mm: ["tile_height_mm", "height_mm", "세로", "세로mm", "타일세로", "세로(mm)"],
  grout_color: ["grout_color", "줄눈색", "줄눈색상", "줄눈"],
  grout_width_mm: ["grout_width_mm", "줄눈두께", "줄눈폭", "줄눈두께mm"],
  finish: ["finish", "마감", "광택"],
  real_width_mm: ["real_width_mm", "실제폭", "폭", "w", "w_mm"],
  real_height_mm: ["real_height_mm", "실제높이", "높이", "h", "h_mm"],
  real_depth_mm: ["real_depth_mm", "실제깊이", "깊이", "d", "d_mm"],
  mount_type: ["mount_type", "설치방식", "설치"],
  anchor_x: ["anchor_x", "접지점x"],
  anchor_y: ["anchor_y", "접지점y"],
  price: ["price", "가격", "단가", "판매가"],
  tags: ["tags", "태그"],
  base_color: ["base_color", "대표색", "색상", "컬러"],
  is_public: ["is_public", "공개", "공개여부"],
};

const KIND_ALIASES: Record<string, MaterialKind> = {
  tile_floor: "tile_floor",
  tile_wall: "tile_wall",
  toilet: "toilet",
  basin: "basin",
  bathtub: "bathtub",
  shower: "shower",
  faucet: "faucet",
  accessory: "accessory",
  바닥타일: "tile_floor",
  바닥: "tile_floor",
  벽타일: "tile_wall",
  벽: "tile_wall",
  양변기: "toilet",
  변기: "toilet",
  세면기: "basin",
  세면대: "basin",
  욕조: "bathtub",
  샤워부스: "shower",
  샤워: "shower",
  수전: "faucet",
  액세서리: "accessory",
  악세사리: "accessory",
  악세서리: "accessory",
};

const FINISH_ALIASES: Record<string, Finish> = {
  matte: "matte",
  matt: "matte",
  무광: "matte",
  glossy: "glossy",
  gloss: "glossy",
  유광: "glossy",
  satin: "satin",
  새틴: "satin",
  반광: "satin",
};

const MOUNT_ALIASES: Record<string, MountType> = {
  floor: "floor",
  바닥: "floor",
  바닥설치: "floor",
  바닥형: "floor",
  wall: "wall",
  벽: "wall",
  벽걸이: "wall",
  벽걸이형: "wall",
  countertop: "countertop",
  카운터탑: "countertop",
  카운터: "countertop",
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "").replace(/[()（）]/g, "");
}

/** 헤더 문자열 → 필드명 (알 수 없으면 null) */
export function normalizeHeader(header: string): CsvField | null {
  const n = norm(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [CsvField, string[]][]) {
    if (aliases.some((a) => norm(a) === n)) return field;
  }
  return null;
}

export function parseKind(value: string): MaterialKind | null {
  const n = norm(value);
  if (KIND_ALIASES[n]) return KIND_ALIASES[n];
  return (ALL_KINDS as readonly string[]).includes(n) ? (n as MaterialKind) : null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/[,\s원₩]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseBool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  const n = norm(String(value));
  if (["true", "1", "y", "yes", "공개", "o", "예"].includes(n)) return true;
  if (["false", "0", "n", "no", "비공개", "x", "아니오"].includes(n)) return false;
  return null;
}

function parseHex(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  return m ? `#${m[1].toLowerCase()}` : null;
}

export interface CsvRowError {
  row: number;
  message: string;
}

export interface ParsedMaterials {
  inserts: MaterialInsert[];
  errors: CsvRowError[];
  /** 인식된 헤더 매핑 */
  mapping: Record<string, CsvField | null>;
}

/**
 * 파싱된 행 객체 배열 → materials insert 배열.
 * @param rows 헤더를 키로 갖는 행 객체 (papaparse / xlsx sheet_to_json 출력)
 */
export function parseMaterialRows(
  rows: Record<string, unknown>[],
  defaults: { owner_id: string; is_public?: boolean },
): ParsedMaterials {
  // 행마다 키가 다를 수 있으므로(엑셀 빈 셀 등) 모든 행의 키 합집합으로 매핑한다
  const headers = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) headers.add(key);
  const mapping: Record<string, CsvField | null> = {};
  for (const h of headers) mapping[h] = normalizeHeader(h);

  const inserts: MaterialInsert[] = [];
  const errors: CsvRowError[] = [];

  rows.forEach((raw, i) => {
    const rowNo = i + 2; // 헤더가 1행
    const get = (field: CsvField): unknown => {
      for (const [h, f] of Object.entries(mapping)) if (f === field) return raw[h];
      return undefined;
    };
    const str = (field: CsvField): string | null => {
      const v = get(field);
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };

    const name = str("name");
    const kindRaw = str("kind");
    if (!name && !kindRaw) return; // 빈 행
    if (!name) {
      errors.push({ row: rowNo, message: "이름이 비어 있습니다." });
      return;
    }
    const kind = kindRaw ? parseKind(kindRaw) : null;
    if (!kind) {
      errors.push({ row: rowNo, message: `종류를 인식할 수 없습니다: "${kindRaw ?? ""}"` });
      return;
    }

    const finishRaw = str("finish");
    const finish = finishRaw ? (FINISH_ALIASES[norm(finishRaw)] ?? null) : null;
    if (finishRaw && !finish) {
      errors.push({ row: rowNo, message: `마감을 인식할 수 없습니다: "${finishRaw}"` });
      return;
    }
    const mountRaw = str("mount_type");
    const mount = mountRaw ? (MOUNT_ALIASES[norm(mountRaw)] ?? null) : null;
    if (mountRaw && !mount) {
      errors.push({ row: rowNo, message: `설치방식을 인식할 수 없습니다: "${mountRaw}"` });
      return;
    }

    const baseColor = parseHex(get("base_color"));
    const tagsRaw = str("tags");
    const tags = tagsRaw
      ? tagsRaw
          .split(/[,;|/]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const isTile = kind === "tile_floor" || kind === "tile_wall";
    const imageUrl = str("texture_url");
    const cutoutUrl = str("cutout_url");

    const insert: MaterialInsert = {
      kind,
      name,
      brand: str("brand"),
      model_code: str("model_code"),
      texture_url: isTile ? imageUrl : null,
      cutout_url: !isTile ? (cutoutUrl ?? imageUrl) : null,
      thumbnail_url: str("thumbnail_url") ?? imageUrl ?? cutoutUrl,
      tile_width_mm: isTile ? parseNumber(get("tile_width_mm")) : null,
      tile_height_mm: isTile ? parseNumber(get("tile_height_mm")) : null,
      grout_color: parseHex(get("grout_color")) ?? undefined,
      grout_width_mm: parseNumber(get("grout_width_mm")) ?? undefined,
      finish,
      gloss: finish ? FINISH_GLOSS[finish] : undefined,
      real_width_mm: parseNumber(get("real_width_mm")),
      real_height_mm: parseNumber(get("real_height_mm")),
      real_depth_mm: parseNumber(get("real_depth_mm")),
      mount_type: mount,
      anchor_x: parseNumber(get("anchor_x")),
      anchor_y: parseNumber(get("anchor_y")),
      price: parseNumber(get("price")),
      tags,
      base_color: baseColor,
      meta: baseColor ? { hue_bucket: hueBucketOf(baseColor) } : {},
      owner_id: defaults.owner_id,
      is_public: parseBool(get("is_public")) ?? defaults.is_public ?? false,
    };
    inserts.push(insert);
  });

  return { inserts, errors, mapping };
}

/** 다운로드용 템플릿 CSV (UTF-8 BOM 포함) */
export const CSV_TEMPLATE =
  "﻿" +
  [
    "종류,이름,브랜드,모델코드,이미지URL,가로mm,세로mm,줄눈색,줄눈두께,마감,실제폭,실제높이,실제깊이,설치방식,가격,태그,대표색,공개",
    "바닥타일,카라라 마블 600각,대림,DL-6001,https://example.com/marble.jpg,600,600,#d8d5d0,3,유광,,,,,28000,대리석;화이트,#f2f0ec,공개",
    "양변기,클래식 원피스 양변기,대림,CC-291,https://example.com/toilet.png,,,,,,380,760,700,바닥설치,320000,양변기;화이트,#f5f5f5,공개",
  ].join("\n");
