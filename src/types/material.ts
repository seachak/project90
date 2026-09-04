import type { Enums, Tables, TablesInsert, TablesUpdate } from "@/types/database.types";

export type MaterialKind = Enums<"material_kind">;
export type Material = Tables<"materials">;
export type MaterialInsert = TablesInsert<"materials">;
export type MaterialUpdate = TablesUpdate<"materials">;

export const TILE_KINDS = ["tile_floor", "tile_wall"] as const satisfies readonly MaterialKind[];
export const OBJECT_KINDS = [
  "toilet",
  "basin",
  "bathtub",
  "shower",
  "faucet",
  "accessory",
] as const satisfies readonly MaterialKind[];
export const ALL_KINDS: readonly MaterialKind[] = [...TILE_KINDS, ...OBJECT_KINDS];

export type TileKind = (typeof TILE_KINDS)[number];
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** 인테리어 업계 표준 용어 */
export const KIND_LABELS: Record<MaterialKind, string> = {
  tile_floor: "바닥타일",
  tile_wall: "벽타일",
  toilet: "양변기",
  basin: "세면기",
  bathtub: "욕조",
  shower: "샤워부스",
  faucet: "수전",
  accessory: "액세서리",
};

export function isTileKind(kind: MaterialKind): kind is TileKind {
  return (TILE_KINDS as readonly MaterialKind[]).includes(kind);
}

export function isObjectKind(kind: MaterialKind): kind is ObjectKind {
  return (OBJECT_KINDS as readonly MaterialKind[]).includes(kind);
}

// ---------- 마감 / 광택 ----------
export type Finish = "matte" | "glossy" | "satin";
export const FINISH_OPTIONS: { value: Finish; label: string; gloss: number }[] = [
  { value: "matte", label: "무광", gloss: 0.05 },
  { value: "satin", label: "새틴", gloss: 0.2 },
  { value: "glossy", label: "유광", gloss: 0.45 },
];
export const FINISH_GLOSS: Record<Finish, number> = { matte: 0.05, satin: 0.2, glossy: 0.45 };

// ---------- 설치 방식 ----------
export type MountType = "floor" | "wall" | "countertop";
export const MOUNT_OPTIONS: { value: MountType; label: string }[] = [
  { value: "floor", label: "바닥설치" },
  { value: "wall", label: "벽걸이" },
  { value: "countertop", label: "카운터탑" },
];
/** 벽걸이형 기본 설치 높이 (바닥에서 접지점까지, mm) */
export const DEFAULT_WALL_MOUNT_HEIGHT_MM: Partial<Record<MaterialKind, number>> = {
  toilet: 400,
  basin: 800,
  faucet: 1000,
  shower: 1100,
  accessory: 1200,
};
export const DEFAULT_MOUNT_BY_KIND: Record<ObjectKind, MountType> = {
  toilet: "floor",
  basin: "wall",
  bathtub: "floor",
  shower: "floor",
  faucet: "wall",
  accessory: "wall",
};

// ---------- 타일 규격 프리셋 (가로×세로 mm) ----------
export const TILE_SIZE_PRESETS: { w: number; h: number; label?: string }[] = [
  { w: 600, h: 600 },
  { w: 300, h: 600 },
  { w: 600, h: 1200 },
  { w: 300, h: 300 },
  { w: 200, h: 200 },
  { w: 250, h: 400 },
  { w: 150, h: 75, label: "서브웨이" },
  { w: 300, h: 100 },
  { w: 200, h: 1200, label: "우드 플랭크" },
  { w: 150, h: 900 },
];

// ---------- 타일 패턴 ----------
export type TilePattern = "grid" | "brick" | "brick_1_3" | "herringbone" | "stack" | "diagonal";
export const PATTERN_OPTIONS: { value: TilePattern; label: string; description: string }[] = [
  { value: "grid", label: "정렬", description: "격자 정렬 시공" },
  { value: "brick", label: "벽돌 1/2", description: "행마다 50% 엇갈림" },
  { value: "brick_1_3", label: "벽돌 1/3", description: "행마다 33% 엇갈림" },
  { value: "herringbone", label: "헤링본", description: "직사각 타일 전용" },
  { value: "stack", label: "세로 쌓기", description: "세로 방향 정렬" },
  { value: "diagonal", label: "대각선", description: "45도 회전 시공" },
];

// ---------- 색상 팔레트 필터 ----------
export const HUE_BUCKETS = [
  { value: "white", label: "화이트", swatch: "#f4f4f2" },
  { value: "gray", label: "그레이", swatch: "#8a8a8a" },
  { value: "black", label: "블랙", swatch: "#1e1e1e" },
  { value: "beige", label: "베이지", swatch: "#d9c7a8" },
  { value: "brown", label: "브라운", swatch: "#7a5233" },
  { value: "red", label: "레드", swatch: "#b8433b" },
  { value: "yellow", label: "옐로우", swatch: "#d9b33b" },
  { value: "green", label: "그린", swatch: "#5a8a5c" },
  { value: "blue", label: "블루", swatch: "#3f6ea6" },
  { value: "purple", label: "퍼플", swatch: "#7a5a9c" },
  { value: "pink", label: "핑크", swatch: "#d48aa0" },
] as const;
export type HueBucket = (typeof HUE_BUCKETS)[number]["value"];

/** materials.meta 에 저장하는 앱 전용 필드 */
export interface MaterialMeta {
  hue_bucket?: HueBucket;
  /** 이음매 처리 방식 */
  seam_fix?: "none" | "mirror" | "offset";
  seam_score?: number;
  /** 랜덤 90도 회전 허용 (대리석·우드) */
  random_rotate?: boolean;
  /** 원본 이미지 크기 */
  source_width?: number;
  source_height?: number;
  gallery?: string[];
  [key: string]: unknown;
}
