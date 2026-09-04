import { describe, expect, it } from "vitest";
import { normalizeHeader, parseKind, parseMaterialRows } from "@/lib/materials/csv";

describe("normalizeHeader", () => {
  it("한국어/영어 헤더를 필드로 매핑한다", () => {
    expect(normalizeHeader("종류")).toBe("kind");
    expect(normalizeHeader("Kind")).toBe("kind");
    expect(normalizeHeader("이미지 URL")).toBe("texture_url");
    expect(normalizeHeader("가로(mm)")).toBe("tile_width_mm");
    expect(normalizeHeader("판매가")).toBe("price");
    expect(normalizeHeader("알수없음")).toBeNull();
  });
});

describe("parseKind", () => {
  it("한국어 별칭을 인식한다", () => {
    expect(parseKind("바닥타일")).toBe("tile_floor");
    expect(parseKind("변기")).toBe("toilet");
    expect(parseKind("세면대")).toBe("basin");
    expect(parseKind("tile_wall")).toBe("tile_wall");
    expect(parseKind("책상")).toBeNull();
  });
});

describe("parseMaterialRows", () => {
  const owner = "00000000-0000-0000-0000-000000000001";

  it("타일 행을 insert 로 변환한다", () => {
    const { inserts, errors } = parseMaterialRows(
      [
        {
          종류: "바닥타일",
          이름: "카라라 마블",
          브랜드: "대림",
          이미지URL: "https://x/marble.jpg",
          가로mm: "600",
          세로mm: "600",
          마감: "유광",
          가격: "28,000원",
          태그: "대리석; 화이트",
          대표색: "#f2f0ec",
          공개: "공개",
        },
      ],
      { owner_id: owner },
    );
    expect(errors).toHaveLength(0);
    expect(inserts).toHaveLength(1);
    const m = inserts[0];
    expect(m.kind).toBe("tile_floor");
    expect(m.texture_url).toBe("https://x/marble.jpg");
    expect(m.cutout_url).toBeNull();
    expect(m.tile_width_mm).toBe(600);
    expect(m.finish).toBe("glossy");
    expect(m.gloss).toBe(0.45);
    expect(m.price).toBe(28000);
    expect(m.tags).toEqual(["대리석", "화이트"]);
    expect(m.is_public).toBe(true);
    expect(m.owner_id).toBe(owner);
    expect(m.meta).toEqual({ hue_bucket: "white" });
  });

  it("위생도기 행은 이미지 URL 을 cutout_url 로 넣는다", () => {
    const { inserts } = parseMaterialRows(
      [{ kind: "toilet", name: "원피스 양변기", image_url: "https://x/t.png", 설치방식: "바닥설치", 실제폭: "380" }],
      { owner_id: owner },
    );
    expect(inserts[0].cutout_url).toBe("https://x/t.png");
    expect(inserts[0].texture_url).toBeNull();
    expect(inserts[0].mount_type).toBe("floor");
    expect(inserts[0].real_width_mm).toBe(380);
  });

  it("잘못된 행은 오류로 보고하고 건너뛴다", () => {
    const { inserts, errors } = parseMaterialRows(
      [
        { 종류: "책상", 이름: "이상한 것" },
        { 종류: "벽타일", 이름: "" },
        { 종류: "벽타일", 이름: "정상", 마감: "반짝" },
        { 종류: "", 이름: "" },
      ],
      { owner_id: owner },
    );
    expect(inserts).toHaveLength(0);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4]);
  });
});
