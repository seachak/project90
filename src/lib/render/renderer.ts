/**
 * PixiJS v8 기반 씬 렌더러.
 *
 * 레이어 구조 (stage)
 *   world (카메라 변환: scale / position)
 *     ├ baseSprite      원본 사진
 *     ├ surfaceRoot     표면 메시 (호모그래피 워프 + 마스크 + shading)
 *     ├ objectRoot      위생도기 (Phase 8)
 *     └ beforeSprite    Before/After 전환용 원본 (Phase 6)
 *
 * 렌더는 dirty flag + requestAnimationFrame 으로만 실행한다.
 */
import {
  Application,
  CanvasSource,
  Container,
  Geometry,
  ImageSource,
  Mesh,
  Shader,
  Sprite,
  Texture,
  TextureStyle,
  UniformGroup,
  type TextureSource,
} from "pixi.js";
import { polygonBounds, type Point } from "@/lib/geometry";
import { canvasToImageData, drawToCanvas, loadImage } from "@/lib/image/loadImage";
import type { RasterLike } from "@/lib/image/palette";
import { rasterizePolygon } from "@/lib/mask/rasterize";
import { applyHomography, homographyFromRect, invertHomography, localScale, type Mat3 } from "@/lib/render/homography";
import { drawPolygonMask } from "@/lib/render/maskTexture";
import { choosePxPerMm, drawTilePattern, type PatternRect } from "@/lib/render/patternCanvas";
import { SURFACE_FRAGMENT, SURFACE_VERTEX } from "@/lib/render/shaders";
import { computeShading, encodeShading } from "@/lib/render/shading";
import type { RenderSurface } from "@/store/useProjectStore";
import type { Material, MaterialMeta } from "@/types/material";
import type { TilePlacement } from "@/types/placement";

export interface CameraState {
  scale: number;
  x: number;
  y: number;
}

interface DecodedImage {
  source: HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
}

interface SurfaceLayer {
  surface: RenderSurface;
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  maskCanvas: HTMLCanvasElement;
  maskSource: CanvasSource;
  patternCanvas: HTMLCanvasElement;
  patternSource: CanvasSource | null;
  H: Mat3;
  invH: Mat3;
  patternRect: PatternRect;
  pxPerMm: number;
  geometryKey: string;
  placementKey: string | null;
  generation: number;
  shadingSource: CanvasSource | ImageSource | null;
  shadingKey: string;
  shadingGeneration: number;
}

const MAX_IMAGE_DECODE = 1024;
const SHADING_RASTER_SIZE = 1024;

function placementKeyOf(p: TilePlacement, material: Material, pxPerMm: number, rect: PatternRect): string {
  const meta = (material.meta ?? {}) as MaterialMeta;
  return [
    p.material_id,
    p.pattern,
    p.offset_x_mm,
    p.offset_y_mm,
    p.rotate_deg,
    p.grout_override ?? material.grout_color ?? "",
    material.tile_width_mm,
    material.tile_height_mm,
    material.grout_width_mm,
    meta.random_rotate ? 1 : 0,
    pxPerMm.toFixed(3),
    rect.minX.toFixed(1),
    rect.minY.toFixed(1),
    rect.width.toFixed(1),
    rect.height.toFixed(1),
  ].join("|");
}

function geometryKeyOf(s: RenderSurface): string {
  return JSON.stringify([s.polygon, s.quad, s.real_width_mm, s.real_height_mm]);
}

function makeTextureStyle(options: { repeat?: boolean; anisotropy?: number }): TextureStyle {
  return new TextureStyle({
    addressMode: options.repeat ? "repeat" : "clamp-to-edge",
    scaleMode: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: options.anisotropy ?? 1,
  });
}

export class SceneRenderer {
  readonly app: Application;
  readonly world = new Container();
  private readonly surfaceRoot = new Container();
  readonly objectRoot = new Container();
  private baseSprite: Sprite | null = null;
  private baseSource: TextureSource | null = null;
  /** shading 계산용 다운스케일 래스터 (≤1024) */
  private baseRaster: RasterLike | null = null;
  private baseRasterScale = 1;
  /** shading 합성 강도 0~1 */
  private shadingStrength = 1;
  private readonly layers = new Map<string, SurfaceLayer>();
  private readonly imageCache = new Map<string, Promise<DecodedImage>>();
  private readonly whiteSource: CanvasSource;
  private dirty = false;
  private raf = 0;
  private destroyed = false;
  imageWidth = 0;
  imageHeight = 0;
  camera: CameraState = { scale: 1, x: 0, y: 0 };
  /** 렌더가 끝날 때마다 호출 (FPS 표시 등) */
  onRendered: ((ms: number) => void) | null = null;

  private constructor(app: Application) {
    this.app = app;
    app.stage.addChild(this.world);
    this.world.addChild(this.surfaceRoot);
    this.world.addChild(this.objectRoot);
    const white = document.createElement("canvas");
    white.width = 2;
    white.height = 2;
    const ctx = white.getContext("2d")!;
    ctx.fillStyle = "rgb(128,128,128)";
    ctx.fillRect(0, 0, 2, 2);
    this.whiteSource = new CanvasSource({ resource: white });
  }

  static async create(canvas: HTMLCanvasElement, width: number, height: number): Promise<SceneRenderer> {
    const app = new Application();
    await app.init({
      canvas,
      width: Math.max(1, width),
      height: Math.max(1, height),
      resolution: Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 0,
      preference: "webgl",
      autoStart: false,
      sharedTicker: false,
    });
    app.ticker.stop();
    return new SceneRenderer(app);
  }

  // ---------- 이미지 ----------
  private decodeImage(url: string): Promise<DecodedImage> {
    let p = this.imageCache.get(url);
    if (!p) {
      p = loadImage(url).then((img) => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (Math.max(w, h) <= MAX_IMAGE_DECODE) return { source: img, width: w, height: h };
        const s = MAX_IMAGE_DECODE / Math.max(w, h);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * s);
        canvas.height = Math.round(h * s);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        return { source: canvas, width: canvas.width, height: canvas.height };
      });
      this.imageCache.set(url, p);
      p.catch(() => this.imageCache.delete(url));
    }
    return p;
  }

  /** 자재 텍스처 미리 디코딩 (호버 즉시 반응용) */
  preload(url: string | null | undefined): void {
    if (url) void this.decodeImage(url).catch(() => undefined);
  }

  async setBaseImage(url: string, width: number, height: number): Promise<void> {
    const img = await loadImage(url);
    if (this.destroyed) return;
    this.imageWidth = width || img.naturalWidth;
    this.imageHeight = height || img.naturalHeight;
    this.baseSource?.destroy();
    this.baseSource = new ImageSource({ resource: img });
    this.baseSource.style = makeTextureStyle({});
    const texture = new Texture({ source: this.baseSource });
    if (!this.baseSprite) {
      this.baseSprite = new Sprite(texture);
      this.world.addChildAt(this.baseSprite, 0);
    } else {
      this.baseSprite.texture = texture;
    }
    this.baseSprite.width = this.imageWidth;
    this.baseSprite.height = this.imageHeight;
    // shading 계산용 래스터
    const small = drawToCanvas(img, SHADING_RASTER_SIZE);
    this.baseRaster = canvasToImageData(small);
    this.baseRasterScale = small.width / this.imageWidth;
    for (const layer of this.layers.values()) {
      this.updateImageSize(layer);
      layer.shadingKey = "";
      this.updateLayerShading(layer);
    }
    this.requestRender();
  }

  /** shading 합성 강도 (0 = 끔, 1 = 원본 조명 그대로) */
  setShadingStrength(strength: number): void {
    this.shadingStrength = Math.min(1, Math.max(0, strength));
    for (const layer of this.layers.values()) {
      if (!layer.shadingSource) continue;
      (layer.uniforms.uniforms as Record<string, unknown>).uUseShading = this.shadingStrength;
      layer.uniforms.update();
    }
    this.requestRender();
  }

  /**
   * 표면의 shading map 을 준비한다.
   * surfaces.shading_url 이 있으면 그 PNG 를, 없으면 원본 사진에서 즉석 계산한다.
   */
  private updateLayerShading(layer: SurfaceLayer): void {
    const surface = layer.surface;
    const key = `${surface.shading_url ?? ""}|${JSON.stringify(surface.polygon)}|${this.baseRaster ? this.baseRaster.width : 0}`;
    if (layer.shadingKey === key) return;
    layer.shadingKey = key;
    const generation = ++layer.shadingGeneration;
    const apply = (source: CanvasSource | ImageSource) => {
      if (this.destroyed || layer.shadingGeneration !== generation) {
        source.destroy();
        return;
      }
      layer.shadingSource?.destroy();
      layer.shadingSource = source;
      layer.mesh.shader!.resources.uShading = source;
      (layer.uniforms.uniforms as Record<string, unknown>).uUseShading = this.shadingStrength;
      layer.uniforms.update();
      this.requestRender();
    };

    if (surface.shading_url) {
      loadImage(surface.shading_url)
        .then((img) => {
          const source = new ImageSource({ resource: img });
          source.style = makeTextureStyle({});
          apply(source);
        })
        .catch((err) => {
          console.warn("shading map load failed, computing locally", err);
          if (layer.shadingGeneration === generation) this.computeLayerShading(layer, generation, apply);
        });
      return;
    }
    this.computeLayerShading(layer, generation, apply);
  }

  private computeLayerShading(layer: SurfaceLayer, generation: number, apply: (source: CanvasSource) => void): void {
    const raster = this.baseRaster;
    if (!raster) return; // 사진이 로드되면 다시 호출된다
    // 첫 프레임을 막지 않도록 다음 틱에 계산
    setTimeout(() => {
      if (this.destroyed || layer.shadingGeneration !== generation) return;
      const mask = rasterizePolygon(layer.surface.polygon, raster.width, raster.height, this.baseRasterScale);
      const result = computeShading(raster, mask);
      const rgba = encodeShading(result, mask);
      const canvas = document.createElement("canvas");
      canvas.width = raster.width;
      canvas.height = raster.height;
      canvas.getContext("2d")!.putImageData(new ImageData(rgba, raster.width, raster.height), 0, 0);
      const source = new CanvasSource({ resource: canvas });
      source.style = makeTextureStyle({});
      apply(source);
    }, 0);
  }

  // ---------- 카메라 ----------
  setCamera(camera: CameraState): void {
    this.camera = camera;
    this.world.position.set(camera.x, camera.y);
    this.world.scale.set(camera.scale);
    this.requestRender();
  }

  fitCamera(viewW: number, viewH: number, padding = 0.98): CameraState {
    if (this.imageWidth === 0) return this.camera;
    const scale = Math.min(viewW / this.imageWidth, viewH / this.imageHeight) * padding;
    const cam = { scale, x: (viewW - this.imageWidth * scale) / 2, y: (viewH - this.imageHeight * scale) / 2 };
    this.setCamera(cam);
    return cam;
  }

  resize(width: number, height: number): void {
    if (this.destroyed) return;
    this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
    this.requestRender();
  }

  // ---------- 표면 ----------
  setSurfaces(surfaces: RenderSurface[]): void {
    const ids = new Set(surfaces.map((s) => s.id));
    for (const [id, layer] of this.layers) {
      if (!ids.has(id)) {
        this.disposeLayer(layer);
        this.layers.delete(id);
      }
    }
    const sorted = [...surfaces].sort((a, b) => a.z_order - b.z_order);
    for (const surface of sorted) {
      const key = geometryKeyOf(surface);
      let layer = this.layers.get(surface.id);
      if (!layer) {
        layer = this.createLayer(surface);
        this.layers.set(surface.id, layer);
      } else if (layer.geometryKey !== key) {
        this.updateLayerGeometry(layer, surface);
      } else {
        layer.surface = surface;
      }
      this.updateLayerShading(layer);
      this.surfaceRoot.addChild(layer.mesh); // 재추가로 z 순서 정렬
    }
    this.requestRender();
  }

  private createLayer(surface: RenderSurface): SurfaceLayer {
    const maskCanvas = document.createElement("canvas");
    const maskSource = new CanvasSource({ resource: maskCanvas });
    maskSource.style = makeTextureStyle({});
    const patternCanvas = document.createElement("canvas");
    patternCanvas.width = 2;
    patternCanvas.height = 2;

    const uniforms = new UniformGroup({
      uInvH0: { value: new Float32Array([1, 0, 0]), type: "vec3<f32>" },
      uInvH1: { value: new Float32Array([0, 1, 0]), type: "vec3<f32>" },
      uInvH2: { value: new Float32Array([0, 0, 1]), type: "vec3<f32>" },
      uPatternRect: { value: new Float32Array([0, 0, 1, 1]), type: "vec4<f32>" },
      uImageSize: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
      uOpacity: { value: 1, type: "f32" },
      uGloss: { value: 0.2, type: "f32" },
      uUseShading: { value: 0, type: "f32" },
      uDetailStrength: { value: 0.35, type: "f32" },
    });

    const geometry = new Geometry({
      attributes: { aPosition: [0, 0, 1, 0, 1, 1, 0, 1] },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    });
    const shader = Shader.from({
      gl: { vertex: SURFACE_VERTEX, fragment: SURFACE_FRAGMENT },
      resources: {
        surfaceUniforms: uniforms,
        uPattern: this.whiteSource,
        uMask: maskSource,
        uShading: this.whiteSource,
      },
    });
    const mesh = new Mesh({ geometry, shader });
    mesh.visible = false;

    const layer: SurfaceLayer = {
      surface,
      mesh,
      uniforms,
      maskCanvas,
      maskSource,
      patternCanvas,
      patternSource: null,
      H: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      invH: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      patternRect: { minX: 0, minY: 0, width: 1, height: 1 },
      pxPerMm: 1,
      geometryKey: "",
      placementKey: null,
      generation: 0,
      shadingSource: null,
      shadingKey: "",
      shadingGeneration: 0,
    };
    this.updateLayerGeometry(layer, surface);
    return layer;
  }

  private updateImageSize(layer: SurfaceLayer): void {
    const size = layer.uniforms.uniforms.uImageSize as Float32Array;
    size[0] = Math.max(1, this.imageWidth);
    size[1] = Math.max(1, this.imageHeight);
    layer.uniforms.update();
  }

  private updateLayerGeometry(layer: SurfaceLayer, surface: RenderSurface): void {
    layer.surface = surface;
    layer.geometryKey = geometryKeyOf(surface);
    layer.placementKey = null; // 패턴 재생성 필요

    // 호모그래피: mm 직사각형 → 이미지 px
    try {
      layer.H = homographyFromRect(surface.real_width_mm, surface.real_height_mm, surface.quad);
      layer.invH = invertHomography(layer.H);
    } catch (err) {
      console.warn("homography failed for surface", surface.label, err);
      layer.H = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      layer.invH = layer.H;
    }
    const cols = [layer.uniforms.uniforms.uInvH0, layer.uniforms.uniforms.uInvH1, layer.uniforms.uniforms.uInvH2] as Float32Array[];
    const H = layer.invH;
    // column-major: 열 j = (H[j], H[3+j], H[6+j])
    for (let j = 0; j < 3; j++) {
      cols[j][0] = H[j];
      cols[j][1] = H[3 + j];
      cols[j][2] = H[6 + j];
    }

    // 폴리곤 → mm 바운딩 박스 (소실선 너머 점은 제외, 극단값 클램프)
    const limit = Math.max(surface.real_width_mm, surface.real_height_mm) * 4;
    const mmPoints: Point[] = [];
    for (const p of surface.polygon) {
      const q = [
        H[0] * p[0] + H[1] * p[1] + H[2],
        H[3] * p[0] + H[4] * p[1] + H[5],
        H[6] * p[0] + H[7] * p[1] + H[8],
      ];
      if (q[2] <= 1e-6) continue;
      mmPoints.push([
        Math.max(-limit, Math.min(limit, q[0] / q[2])),
        Math.max(-limit, Math.min(limit, q[1] / q[2])),
      ]);
    }
    if (mmPoints.length < 3) {
      mmPoints.push([0, 0], [surface.real_width_mm, 0], [surface.real_width_mm, surface.real_height_mm], [0, surface.real_height_mm]);
    }
    const b = polygonBounds(mmPoints);
    layer.patternRect = {
      minX: b.minX,
      minY: b.minY,
      width: Math.max(1, b.maxX - b.minX),
      height: Math.max(1, b.maxY - b.minY),
    };
    const rect = layer.uniforms.uniforms.uPatternRect as Float32Array;
    rect[0] = layer.patternRect.minX;
    rect[1] = layer.patternRect.minY;
    rect[2] = layer.patternRect.width;
    rect[3] = layer.patternRect.height;

    // 해상도: quad 모서리에서 가장 큰 px/mm 의 1.5배 (최대 텍스처 크기 제한)
    let maxScale = 0;
    for (const corner of [
      [0, 0],
      [surface.real_width_mm, 0],
      [surface.real_width_mm, surface.real_height_mm],
      [0, surface.real_height_mm],
    ] as Point[]) {
      try {
        maxScale = Math.max(maxScale, localScale(layer.H, corner).mean);
      } catch {
        /* ignore */
      }
    }
    layer.pxPerMm = choosePxPerMm(layer.patternRect, Math.max(0.1, maxScale * 1.5));

    // 메시 지오메트리 = 폴리곤 바운딩 박스 (이미지 px)
    const pb = polygonBounds(surface.polygon);
    const buffer = layer.mesh.geometry.getBuffer("aPosition");
    buffer.data = new Float32Array([pb.minX, pb.minY, pb.maxX, pb.minY, pb.maxX, pb.maxY, pb.minX, pb.maxY]);
    buffer.update();

    // 마스크
    drawPolygonMask(surface.polygon, Math.max(1, this.imageWidth || pb.maxX), Math.max(1, this.imageHeight || pb.maxY), {
      canvas: layer.maskCanvas,
      featherPx: 2,
    });
    layer.maskSource.resize(layer.maskCanvas.width, layer.maskCanvas.height);
    layer.maskSource.update();
    this.updateImageSize(layer);
    layer.uniforms.update();
  }

  private disposeLayer(layer: SurfaceLayer): void {
    layer.shadingGeneration++;
    layer.mesh.removeFromParent();
    layer.mesh.destroy();
    layer.maskSource.destroy();
    layer.patternSource?.destroy();
    layer.shadingSource?.destroy();
  }

  // ---------- 타일 배치 ----------
  /**
   * 표면별 타일 배치를 반영한다. 패턴 텍스처는 먼저 대표색으로 즉시 그리고,
   * 텍스처 디코딩이 끝나면 다시 그린다 (같은 입력이면 같은 결과).
   */
  setTilePlacements(placements: TilePlacement[], materials: Record<string, Material>): void {
    const bySurface = new Map(placements.map((p) => [p.surface_id, p]));
    for (const layer of this.layers.values()) {
      const placement = bySurface.get(layer.surface.id);
      const material = placement ? materials[placement.material_id] : undefined;
      if (!placement || !material) {
        layer.mesh.visible = false;
        layer.placementKey = null;
        continue;
      }
      const key = placementKeyOf(placement, material, layer.pxPerMm, layer.patternRect);
      (layer.uniforms.uniforms as Record<string, unknown>).uGloss = Number(material.gloss ?? 0.2);
      layer.uniforms.update();
      if (layer.placementKey === key && layer.mesh.visible) continue;
      layer.placementKey = key;
      layer.mesh.visible = true;
      this.renderPattern(layer, placement, material);
    }
    this.requestRender();
  }

  private renderPattern(layer: SurfaceLayer, placement: TilePlacement, material: Material): void {
    const generation = ++layer.generation;
    const meta = (material.meta ?? {}) as MaterialMeta;
    const tileW = material.tile_width_mm ?? 600;
    const tileH = material.tile_height_mm ?? 600;
    const grout = Number(material.grout_width_mm ?? 3);
    const draw = (img: DecodedImage | null) => {
      drawTilePattern(layer.patternCanvas, {
        image: img?.source ?? null,
        imageWidth: img?.width ?? 1,
        imageHeight: img?.height ?? 1,
        pattern: placement.pattern,
        tileW,
        tileH,
        grout,
        groutColor: placement.grout_override ?? material.grout_color ?? "#d8d5d0",
        rect: layer.patternRect,
        pxPerMm: layer.pxPerMm,
        offsetX: placement.offset_x_mm,
        offsetY: placement.offset_y_mm,
        rotateDeg: placement.rotate_deg,
        randomRotate: Boolean(meta.random_rotate),
        fallbackColor: material.base_color ?? "#bdbdbd",
      });
      this.uploadPattern(layer);
      this.requestRender();
    };

    const url = material.texture_url ?? material.thumbnail_url;
    if (!url) {
      draw(null);
      return;
    }
    const cached = this.imageCache.get(url);
    // 이미 디코딩된 이미지면 즉시, 아니면 대표색으로 먼저 그린 뒤 교체
    let drewFallback = false;
    if (!cached) {
      draw(null);
      drewFallback = true;
    }
    this.decodeImage(url)
      .then((img) => {
        if (this.destroyed || layer.generation !== generation) return;
        draw(img);
      })
      .catch(() => {
        if (!drewFallback && layer.generation === generation) draw(null);
      });
  }

  private uploadPattern(layer: SurfaceLayer): void {
    const canvas = layer.patternCanvas;
    const src = layer.patternSource;
    if (src && src.width === canvas.width && src.height === canvas.height) {
      src.update();
      return;
    }
    src?.destroy();
    const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true });
    source.style = makeTextureStyle({ anisotropy: 16 });
    layer.patternSource = source;
    layer.mesh.shader!.resources.uPattern = source;
  }

  // ---------- 렌더 루프 ----------
  requestRender(): void {
    if (this.dirty || this.destroyed) return;
    this.dirty = true;
    this.raf = requestAnimationFrame(() => {
      this.dirty = false;
      if (this.destroyed) return;
      const t0 = performance.now();
      this.app.renderer.render(this.app.stage);
      this.onRendered?.(performance.now() - t0);
    });
  }

  /** 즉시 렌더 (스냅샷 등) */
  renderNow(): void {
    if (this.destroyed) return;
    this.app.renderer.render(this.app.stage);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const layer of this.layers.values()) this.disposeLayer(layer);
    this.layers.clear();
    this.baseSource?.destroy();
    this.whiteSource.destroy();
    this.app.destroy(false, { children: true });
  }

  /** 디버그: 이미지 좌표 → 특정 표면의 mm 좌표 */
  imageToSurfaceMm(surfaceId: string, p: Point): Point | null {
    const layer = this.layers.get(surfaceId);
    if (!layer) return null;
    try {
      return applyHomography(layer.invH, p);
    } catch {
      return null;
    }
  }
}
