"use client";

import { useEffect, useState } from "react";
import { Simulator } from "@/components/simulator/Simulator";
import type { RenderSurface } from "@/store/useProjectStore";
import type { Material } from "@/types/material";

/** 합성 욕실(1600×1200)의 표면 정의 — gen-demo-room.mjs 의 좌표와 일치 */
export const DEMO_SURFACES: RenderSurface[] = [
  {
    id: "demo-floor",
    label: "바닥",
    surface_type: "floor",
    polygon: [
      [0, 1200],
      [400, 850],
      [1200, 850],
      [1600, 1200],
    ],
    quad: [
      [400, 850],
      [1200, 850],
      [1600, 1200],
      [0, 1200],
    ],
    real_width_mm: 3000,
    real_height_mm: 3000,
    shading_url: null,
    z_order: 0,
  },
  {
    id: "demo-back",
    label: "정면벽",
    surface_type: "wall",
    polygon: [
      [400, 250],
      [1200, 250],
      [1200, 850],
      [400, 850],
    ],
    quad: [
      [400, 250],
      [1200, 250],
      [1200, 850],
      [400, 850],
    ],
    real_width_mm: 3000,
    real_height_mm: 2250,
    shading_url: null,
    z_order: 1,
  },
  {
    id: "demo-left",
    label: "좌측벽",
    surface_type: "wall",
    polygon: [
      [0, 0],
      [400, 250],
      [400, 850],
      [0, 1200],
    ],
    quad: [
      [0, 0],
      [400, 250],
      [400, 850],
      [0, 1200],
    ],
    real_width_mm: 3000,
    real_height_mm: 2250,
    shading_url: null,
    z_order: 2,
  },
  {
    id: "demo-right",
    label: "우측벽",
    surface_type: "wall",
    polygon: [
      [1200, 250],
      [1600, 0],
      [1600, 1200],
      [1200, 850],
    ],
    quad: [
      [1200, 250],
      [1600, 0],
      [1600, 1200],
      [1200, 850],
    ],
    real_width_mm: 3000,
    real_height_mm: 2250,
    shading_url: null,
    z_order: 3,
  },
];

export function DevSimulator() {
  const [materials, setMaterials] = useState<Material[] | null>(null);
  useEffect(() => {
    fetch("/samples/tiles/manifest.json")
      .then((r) => r.json())
      .then((rows: Partial<Material>[]) =>
        setMaterials(
          rows.map((r) => ({
            id: "",
            kind: "tile_floor",
            name: "",
            brand: null,
            model_code: null,
            texture_url: null,
            thumbnail_url: null,
            tile_width_mm: null,
            tile_height_mm: null,
            is_seamless: true,
            grout_color: null,
            grout_width_mm: 3,
            cutout_url: null,
            anchor_x: null,
            anchor_y: null,
            real_width_mm: null,
            real_height_mm: null,
            real_depth_mm: null,
            mount_type: null,
            finish: null,
            gloss: 0.2,
            base_color: null,
            price: null,
            currency: "KRW",
            tags: [],
            meta: {},
            owner_id: null,
            is_public: true,
            created_at: null,
            updated_at: null,
            ...r,
          })),
        ),
      )
      .catch((err) => console.error(err));
  }, []);

  if (!materials) return <div className="p-6 text-sm text-muted-foreground">샘플 자재를 불러오는 중…</div>;
  return (
    <Simulator
      project={{ id: "demo", name: "데모 욕실 (합성 사진)", width_px: 1600, height_px: 1200, imageUrl: "/samples/rooms/demo-bathroom.jpg" }}
      surfaces={DEMO_SURFACES}
      materials={[]}
      tilePlacements={[]}
      objectPlacements={[]}
      staticMaterials={materials}
      mode="demo"
    />
  );
}
