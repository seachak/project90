import { describe, expect, it } from "vitest";
import { extractPalette, hexToRgb, hueBucketOf, kmeansColors, rgbToHex, rgbToHsl } from "@/lib/image/palette";

describe("색 변환", () => {
  it("hex ↔ rgb", () => {
    expect(hexToRgb("#ff8800")).toEqual([255, 136, 0]);
    expect(hexToRgb("abc")).toEqual([170, 187, 204]);
    expect(hexToRgb("nope")).toBeNull();
    expect(rgbToHex([255, 136, 0])).toBe("#ff8800");
  });

  it("rgb → hsl", () => {
    const [h, s, l] = rgbToHsl([255, 0, 0]);
    expect(h).toBe(0);
    expect(s).toBe(1);
    expect(l).toBe(0.5);
  });
});

describe("kmeansColors / extractPalette", () => {
  it("두 색이 반반인 이미지에서 두 색을 찾는다", () => {
    const width = 40;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const x = i % width;
      const o = i * 4;
      const red = x < width / 2;
      data[o] = red ? 200 : 20;
      data[o + 1] = red ? 30 : 40;
      data[o + 2] = red ? 30 : 200;
      data[o + 3] = 255;
    }
    const palette = extractPalette({ width, height, data }, { k: 2 });
    expect(palette).toHaveLength(2);
    const hexes = palette.map((p) => p.hex).sort();
    expect(hexes).toEqual(["#1428c8", "#c81e1e"]);
    expect(palette[0].weight).toBeCloseTo(0.5, 1);
  });

  it("투명 픽셀은 무시한다", () => {
    const data = new Uint8ClampedArray(4 * 4);
    // 첫 픽셀만 불투명 흰색, 나머지는 투명 검정
    data.set([255, 255, 255, 255], 0);
    const palette = extractPalette({ width: 4, height: 1, data }, { k: 3 });
    expect(palette).toHaveLength(1);
    expect(palette[0].hex).toBe("#ffffff");
  });

  it("같은 입력이면 같은 결과 (결정적)", () => {
    const pixels: [number, number, number][] = [];
    for (let i = 0; i < 300; i++) pixels.push([(i * 37) % 256, (i * 91) % 256, (i * 53) % 256]);
    const a = kmeansColors(pixels, 4);
    const b = kmeansColors(pixels, 4);
    expect(a).toEqual(b);
  });
});

describe("hueBucketOf", () => {
  it("무채색 분류", () => {
    expect(hueBucketOf("#ffffff")).toBe("white");
    expect(hueBucketOf("#f2f0ec")).toBe("white");
    expect(hueBucketOf("#808080")).toBe("gray");
    expect(hueBucketOf("#111111")).toBe("black");
  });
  it("유채색 분류", () => {
    expect(hueBucketOf("#c0392b")).toBe("red");
    expect(hueBucketOf("#d9c7a8")).toBe("beige");
    expect(hueBucketOf("#6b4423")).toBe("brown");
    expect(hueBucketOf("#3f6ea6")).toBe("blue");
    expect(hueBucketOf("#5a8a5c")).toBe("green");
    expect(hueBucketOf("#f1c40f")).toBe("yellow");
    expect(hueBucketOf("#8e44ad")).toBe("purple");
    expect(hueBucketOf("#ff9ecf")).toBe("pink");
  });
});
