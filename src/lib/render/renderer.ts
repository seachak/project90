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
  Graphics,
  ImageSource,
  Mesh,
  Rectangle,
  Shader,
  Sprite,
  Texture,
  TextureStyle,
  UniformGroup,
  type TextureSource,
} from "pixi.js";
import type { SceneSettings } from "@/lib/render/colorGrade";
import { ColorGradeFilter } from "@/lib/render/gradeFilter";
import { polygonBounds, type Point } from "@/lib/geometry";
import { canvasToBlob, canvasToImageData, drawToCanvas, loadImage } from "@/lib/image/loadImage";
import type { RasterLike } from "@/lib/image/palette";
import { rasterizePolygon } from "@/lib/mask/rasterize";
import { applyHomography, homographyFromRect, invertHomography, localScale, type Mat3 } from "@/lib/render/homography";
import { drawPolygonMask } from "@/lib/render/maskTexture";
import { choosePxPerMm, drawTilePattern, type PatternRect } from "@/lib/render/patternCanvas";
import { SURFACE_FRAGMENT, SURFACE_VERTEX } from "@/lib/render/shaders";
import { computeShading, encodeShading } from "@/lib/render/shading";
import type { RenderSurface } from "@/store/useProjectStore";
import type { Material, MaterialMeta } from "@/types/material";
import type { ObjectPlacement, TilePlacement } from "@/types/placement";
import {
  imagePointToFixtureUv,
  solveFixtureGeometry,
  type FixtureGeometry,
  type FloorPlane,
} from "@/lib/render/fixture";

export interface CameraState {
  scale: number;
  x: number;
  y: number;
}

/** Before/After 보기 모드 */
export type ViewMode = "after" | "before" | "slider" | "split" | "actual";

const FADE_MS = 200;

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
/** 디코딩된 이미지 캐시 상한 (LRU) */
const IMAGE_CACHE_LIMIT = 32;
/** 히트테스트용 알파 그리드 해상도 */
const ALPHA_PROBE = 64;
/** 접지 그림자 방사형 그라디언트 텍스처 크기 */
const SHADOW_TEX_SIZE = 128;

/** 위생도기 레이어 — 접지 그림자 + 컷아웃 스프라이트 (Phase 8) */
interface ObjectLayer {
  placement: ObjectPlacement;
  container: Container;
  shadow: Sprite;
  sprite: Sprite;
  source: ImageSource | CanvasSource | null;
  /** 컷아웃 URL — 알파 마스크 조회 키 */
  url: string | null;
  geometry: FixtureGeometry | null;
  cutoutAspect: number;
  key: string;
  generation: number;
}

function objectKeyOf(p: ObjectPlacement, material: Material, pxPerMm: number): string {
  return [
    p.material_id,
    p.pos_x.toFixed(5),
    p.pos_y.toFixed(5),
    p.scale,
    p.rotation,
    p.flip_x ? 1 : 0,
    p.z_order,
    material.cutout_url ?? "",
    material.real_width_mm ?? "",
    material.anchor_x ?? "",
    material.anchor_y ?? "",
    material.mount_type ?? "",
    pxPerMm.toFixed(4),
  ].join("|");
}

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

  // ----- Before/After -----
  /** world 최상단의 원본 사진 (BEFORE). 항상 존재하고 alpha/마스크만 바뀐다 → 깜빡임 없음 */
  private beforeSprite: Sprite | null = null;
  /** 실제 시공 후 사진 */
  private actualSprite: Sprite | null = null;
  private actualSource: TextureSource | null = null;
  /** 분할 모드 좌측(BEFORE) 뷰 */
  private readonly splitView = new Container();
  private splitSprite: Sprite | null = null;
  private readonly sliderMask = new Graphics();
  private readonly leftMask = new Graphics();
  private readonly rightMask = new Graphics();
  private viewMode: ViewMode = "after";
  private sliderFraction = 0.5;
  private holdBefore = false;
  private viewportW = 1;
  private viewportH = 1;
  private fade = { alpha: 0, target: 0, from: 0, start: 0, raf: 0 };
  /** 씬 전체 색보정 (Phase 7) */
  private readonly gradeFilter = new ColorGradeFilter();
  private readonly layers = new Map<string, SurfaceLayer>();
  private readonly objectLayers = new Map<string, ObjectLayer>();
  private readonly selectionBox = new Graphics();
  private selectedObjectId: string | null = null;
  /** 내보내기 중에는 선택 테두리를 그리지 않는다 */
  private exporting = false;
  private shadowTexture: Texture | null = null;
  /** 히트테스트용 컷아웃 알파 그리드 (URL → ALPHA_PROBE² Uint8Array) */
  private readonly alphaMasks = new Map<string, Uint8Array>();
  private readonly imageCache = new Map<string, Promise<DecodedImage>>();
  /** imageCache LRU 순서 (앞 = 가장 오래됨) */
  private readonly imageCacheOrder: string[] = [];
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
    this.splitView.visible = false;
    app.stage.addChild(this.splitView);
    app.stage.addChild(this.world);
    this.world.addChild(this.surfaceRoot);
    this.world.addChild(this.objectRoot);
    // 마스크는 항상 붙여 두고 사각형 영역만 바꾼다 (붙였다 떼면 Pixi 가 마스크를 일반 렌더로 되돌려 화면이 깨진다)
    app.stage.addChild(this.leftMask, this.rightMask);
    this.world.addChild(this.sliderMask);
    this.world.mask = this.rightMask;
    this.splitView.mask = this.leftMask;
    this.viewportW = app.renderer.width;
    this.viewportH = app.renderer.height;
    this.updateHalfMasks();
    // 색보정은 stage 전체(원본 + 타일 + 오브젝트 + BEFORE 레이어)에 1패스로 적용
    app.stage.filters = [this.gradeFilter];
    app.stage.filterArea = new Rectangle(0, 0, this.viewportW, this.viewportH);
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
  /** LRU 순서 갱신 + 상한 초과분 제거 (자재를 많이 훑어봐도 메모리가 무한히 늘지 않게) */
  private touchImageCache(url: string): void {
    const i = this.imageCacheOrder.indexOf(url);
    if (i >= 0) this.imageCacheOrder.splice(i, 1);
    this.imageCacheOrder.push(url);
    while (this.imageCacheOrder.length > IMAGE_CACHE_LIMIT) {
      const evicted = this.imageCacheOrder.shift();
      if (evicted === undefined) break;
      this.imageCache.delete(evicted);
      this.alphaMasks.delete(evicted);
    }
  }

  private decodeImage(url: string): Promise<DecodedImage> {
    let p = this.imageCache.get(url);
    this.touchImageCache(url);
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
      p.catch(() => {
        this.imageCache.delete(url);
        const i = this.imageCacheOrder.indexOf(url);
        if (i >= 0) this.imageCacheOrder.splice(i, 1);
      });
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

    // BEFORE 레이어 (world 최상단) + 분할 모드용 복제
    if (!this.beforeSprite) {
      this.beforeSprite = new Sprite(texture);
      this.beforeSprite.alpha = 0;
      this.beforeSprite.mask = this.sliderMask;
      this.world.addChild(this.beforeSprite);
    } else {
      this.beforeSprite.texture = texture;
      this.world.addChild(this.beforeSprite); // 최상단 유지
    }
    this.beforeSprite.width = this.imageWidth;
    this.beforeSprite.height = this.imageHeight;
    if (!this.splitSprite) {
      this.splitSprite = new Sprite(texture);
      this.splitView.addChild(this.splitSprite);
    } else {
      this.splitSprite.texture = texture;
    }
    this.splitSprite.width = this.imageWidth;
    this.splitSprite.height = this.imageHeight;
    if (this.actualSprite) this.world.addChild(this.actualSprite);
    this.applyView(false);

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
      const previous = layer.shadingSource;
      layer.shadingSource = source;
      layer.mesh.shader!.resources.uShading = source;
      previous?.destroy();
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
  /** 분할 모드에서는 오른쪽 절반이 AFTER 뷰포트가 된다 */
  private splitOffsetX(): number {
    return this.viewMode === "split" ? this.viewportW / 2 : 0;
  }

  setCamera(camera: CameraState): void {
    this.camera = camera;
    this.world.position.set(camera.x + this.splitOffsetX(), camera.y);
    this.world.scale.set(camera.scale);
    this.splitView.position.set(camera.x, camera.y);
    this.splitView.scale.set(camera.scale);
    this.updateSliderMask();
    this.updateSelectionBox(); // 선택 테두리는 줌과 무관하게 항상 2px 로 보이게
    this.requestRender();
  }

  fitCamera(viewW: number, viewH: number, padding = 0.98): CameraState {
    if (this.imageWidth === 0) return this.camera;
    const w = this.viewMode === "split" ? viewW / 2 : viewW;
    const scale = Math.min(w / this.imageWidth, viewH / this.imageHeight) * padding;
    const cam = { scale, x: (w - this.imageWidth * scale) / 2, y: (viewH - this.imageHeight * scale) / 2 };
    this.setCamera(cam);
    return cam;
  }

  resize(width: number, height: number): void {
    if (this.destroyed) return;
    this.viewportW = Math.max(1, width);
    this.viewportH = Math.max(1, height);
    this.app.renderer.resize(this.viewportW, this.viewportH);
    this.app.stage.filterArea = new Rectangle(0, 0, this.viewportW, this.viewportH);
    this.updateHalfMasks();
    this.setCamera(this.camera);
  }

  // ---------- 색보정 ----------
  setSceneSettings(settings: SceneSettings): void {
    this.gradeFilter.setSettings(settings);
    this.requestRender();
  }

  /** "원본과 비교": false 면 보정 전 화면 */
  setGradeEnabled(enabled: boolean): void {
    this.gradeFilter.setEnabled(enabled);
    this.requestRender();
  }

  // ---------- Before / After ----------
  private updateHalfMasks(): void {
    const w = this.viewportW;
    const h = this.viewportH;
    this.leftMask.clear().rect(0, 0, w / 2, h).fill(0xffffff);
    // 분할 모드가 아니면 world 마스크는 뷰포트 전체 (= 마스크 없음과 동일)
    if (this.viewMode === "split") this.rightMask.clear().rect(w / 2, 0, w / 2, h).fill(0xffffff);
    else this.rightMask.clear().rect(0, 0, w, h).fill(0xffffff);
  }

  private updateSliderMask(): void {
    const big = 1e5;
    if (this.viewMode === "slider" && !this.holdBefore) {
      const x = (this.sliderFraction * this.viewportW - this.camera.x) / Math.max(1e-6, this.camera.scale);
      this.sliderMask.clear().rect(-big, -big, Math.max(0, x) + big, 2 * big).fill(0xffffff);
    } else {
      this.sliderMask.clear().rect(-big, -big, 2 * big, 2 * big).fill(0xffffff);
    }
  }

  setViewMode(mode: ViewMode): void {
    if (this.viewMode === mode) return;
    const wasSplit = this.viewMode === "split";
    this.viewMode = mode;
    this.applyView(mode === "before" || mode === "after");
    if (wasSplit !== (mode === "split")) this.setCamera(this.camera);
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  setSliderFraction(fraction: number): void {
    this.sliderFraction = Math.min(1, Math.max(0, fraction));
    this.updateSliderMask();
    this.requestRender();
  }

  /** 스페이스바 홀드: 즉시 BEFORE, 떼면 원래 모드로 (페이드 없음) */
  setHoldBefore(hold: boolean): void {
    if (this.holdBefore === hold) return;
    this.holdBefore = hold;
    this.applyView(false);
  }

  /** 실제 시공 후 사진 (있으면 '실제 시공본' 탭) */
  async setActualImage(url: string | null): Promise<void> {
    if (!url) {
      this.actualSprite?.destroy();
      this.actualSprite = null;
      this.actualSource?.destroy();
      this.actualSource = null;
      this.applyView(false);
      return;
    }
    const img = await loadImage(url);
    if (this.destroyed) return;
    this.actualSource?.destroy();
    this.actualSource = new ImageSource({ resource: img });
    this.actualSource.style = makeTextureStyle({});
    const texture = new Texture({ source: this.actualSource });
    if (!this.actualSprite) {
      this.actualSprite = new Sprite(texture);
      this.actualSprite.visible = false;
      this.world.addChild(this.actualSprite);
    } else {
      this.actualSprite.texture = texture;
    }
    this.actualSprite.width = this.imageWidth || img.naturalWidth;
    this.actualSprite.height = this.imageHeight || img.naturalHeight;
    this.applyView(false);
  }

  private applyView(animate: boolean): void {
    const mode = this.viewMode;
    this.splitView.visible = mode === "split";
    this.updateHalfMasks();
    if (this.actualSprite) this.actualSprite.visible = mode === "actual" && !this.holdBefore;
    if (this.beforeSprite) {
      const showBefore = this.holdBefore || mode === "before";
      const target = showBefore ? 1 : mode === "slider" ? 1 : 0;
      this.fadeTo(target, animate ? FADE_MS : 0);
    }
    this.updateSliderMask();
    this.requestRender();
  }

  private fadeTo(target: number, duration: number): void {
    const f = this.fade;
    cancelAnimationFrame(f.raf);
    f.target = target;
    if (duration <= 0 || !this.beforeSprite) {
      f.alpha = target;
      if (this.beforeSprite) this.beforeSprite.alpha = target;
      return;
    }
    f.from = f.alpha;
    f.start = performance.now();
    const step = () => {
      if (this.destroyed || !this.beforeSprite) return;
      const t = Math.min(1, (performance.now() - f.start) / duration);
      const eased = t * (2 - t);
      f.alpha = f.from + (f.target - f.from) * eased;
      this.beforeSprite.alpha = f.alpha;
      this.requestRender();
      if (t < 1) f.raf = requestAnimationFrame(step);
    };
    f.raf = requestAnimationFrame(step);
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
    const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true });
    source.style = makeTextureStyle({ anisotropy: 16 });
    layer.patternSource = source;
    layer.mesh.shader!.resources.uPattern = source; // 먼저 교체한 뒤 이전 소스를 정리 (바인딩 중 destroy 경고 방지)
    src?.destroy();
  }

  // ---------- 위생도기 (Phase 8) ----------

  /** 기준 바닥면 — 자동 스케일의 기준. surface_type 이 floor 인 첫 레이어 */
  private floorPlane(): FloorPlane | null {
    for (const layer of this.layers.values()) {
      if (layer.surface.surface_type === "floor") return { H: layer.H, invH: layer.invH };
    }
    return null;
  }

  /** 접지 그림자용 방사형 그라디언트 (렌더러당 1회 생성해 모든 도기가 공유) */
  private getShadowTexture(): Texture {
    if (this.shadowTexture) return this.shadowTexture;
    const canvas = document.createElement("canvas");
    canvas.width = SHADOW_TEX_SIZE;
    canvas.height = SHADOW_TEX_SIZE;
    const ctx = canvas.getContext("2d")!;
    const r = SHADOW_TEX_SIZE / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    // 중심은 진하고 가장자리로 갈수록 사라진다 — 접지부가 가장 어둡다
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.45, "rgba(0,0,0,0.72)");
    g.addColorStop(0.78, "rgba(0,0,0,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
    this.shadowTexture = new Texture({ source: new CanvasSource({ resource: canvas }) });
    return this.shadowTexture;
  }

  /**
   * 위생도기 배치를 반영한다.
   * 크기는 바닥 호모그래피에서 자동 산출하므로(solveFixtureGeometry) 사용자가 맞출 필요가 없다.
   */
  setObjectPlacements(placements: ObjectPlacement[], materials: Record<string, Material>): void {
    const floor = this.floorPlane();
    const seen = new Set<string>();

    // 뒤쪽(z_order 낮음 · 화면 위쪽) 물체를 먼저 그린다
    const ordered = [...placements].sort((a, b) => a.z_order - b.z_order || a.pos_y - b.pos_y);

    for (const placement of ordered) {
      const material = materials[placement.material_id];
      if (!material?.cutout_url) continue;
      seen.add(placement.id);

      const posImage: Point = [placement.pos_x * this.imageWidth, placement.pos_y * this.imageHeight];
      const scaleAt = floor ? localScale(floor.H, applyHomography(floor.invH, posImage)).mean : 0;
      const key = objectKeyOf(placement, material, scaleAt);

      let layer = this.objectLayers.get(placement.id);
      if (!layer) {
        const container = new Container();
        const shadow = new Sprite(this.getShadowTexture());
        shadow.anchor.set(0.5);
        shadow.blendMode = "multiply";
        const sprite = new Sprite();
        sprite.anchor.set(0.5);
        sprite.visible = false; // 디코딩 전에는 숨긴다 (실루엣을 대충 그리면 오히려 어색하다)
        container.addChild(shadow, sprite);
        this.objectRoot.addChild(container);
        layer = {
          placement,
          container,
          shadow,
          sprite,
          source: null,
          url: null,
          geometry: null,
          cutoutAspect: 1,
          key: "",
          generation: 0,
        };
        this.objectLayers.set(placement.id, layer);
      }

      layer.placement = placement;
      this.objectRoot.setChildIndex(layer.container, this.objectRoot.children.length - 1);
      if (layer.key === key) continue;
      layer.key = key;
      this.loadObjectCutout(layer, material, floor);
    }

    for (const [id, layer] of this.objectLayers) {
      if (seen.has(id)) continue;
      this.disposeObjectLayer(layer);
      this.objectLayers.delete(id);
    }

    this.updateSelectionBox();
    this.requestRender();
  }

  private loadObjectCutout(layer: ObjectLayer, material: Material, floor: FloorPlane | null): void {
    const url = material.cutout_url!;
    const generation = ++layer.generation;

    const place = (aspect: number) => {
      layer.cutoutAspect = aspect;
      const geo = solveFixtureGeometry({
        floor,
        posImage: [layer.placement.pos_x * this.imageWidth, layer.placement.pos_y * this.imageHeight],
        material,
        cutoutAspect: aspect,
        userScale: layer.placement.scale,
        rotationDeg: layer.placement.rotation,
        imageWidth: this.imageWidth,
      });
      layer.geometry = geo;

      layer.sprite.position.set(geo.centerPx[0], geo.centerPx[1]);
      layer.sprite.width = geo.widthPx;
      layer.sprite.height = geo.heightPx;
      layer.sprite.rotation = geo.rotationRad;
      layer.sprite.scale.x = Math.abs(layer.sprite.scale.x) * (layer.placement.flip_x ? -1 : 1);

      layer.shadow.position.set(geo.shadow.center[0], geo.shadow.center[1]);
      layer.shadow.width = geo.shadow.radiusX * 2;
      layer.shadow.height = Math.max(2, geo.shadow.radiusY * 2);
      layer.shadow.alpha = geo.shadow.alpha;
      layer.shadow.visible = geo.shadow.alpha > 0.01;
    };

    // 캐시에 이미 있으면 동기적으로 크기가 잡혀 즉시 반응한다
    if (layer.url === url && layer.sprite.texture !== Texture.EMPTY) {
      place(layer.cutoutAspect);
      this.updateSelectionBox();
      this.requestRender();
      return;
    }

    void this.decodeImage(url)
      .then((img) => {
        if (this.destroyed || layer.generation !== generation) return;
        const prev = layer.source;
        const source =
          img.source instanceof HTMLCanvasElement
            ? new CanvasSource({ resource: img.source })
            : new ImageSource({ resource: img.source });
        source.style = makeTextureStyle({});
        layer.source = source;
        layer.url = url;
        layer.sprite.texture = new Texture({ source });
        layer.sprite.visible = true;
        prev?.destroy();
        this.cacheAlphaMask(url, img);
        place(img.width / img.height);
        this.updateSelectionBox();
        this.requestRender();
      })
      .catch(() => {
        if (layer.generation === generation) {
          layer.sprite.visible = false;
          layer.shadow.visible = false;
          this.requestRender();
        }
      });
  }

  /** 컷아웃의 알파를 저해상도 그리드로 떠 둔다 — 클릭이 도기 실루엣 안인지 판정용 */
  private cacheAlphaMask(url: string, img: DecodedImage): void {
    if (this.alphaMasks.has(url)) return;
    try {
      // UV 조회를 위해 비율을 무시하고 정사각 그리드로 리샘플한다
      const canvas = document.createElement("canvas");
      canvas.width = ALPHA_PROBE;
      canvas.height = ALPHA_PROBE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img.source, 0, 0, ALPHA_PROBE, ALPHA_PROBE);
      const { data } = canvasToImageData(canvas);
      const mask = new Uint8Array(ALPHA_PROBE * ALPHA_PROBE);
      for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];
      this.alphaMasks.set(url, mask);
    } catch {
      // 알파 마스크를 못 만들면 바운딩 박스로만 판정한다
    }
  }

  /** 이미지 좌표에 있는 도기 id (앞에 있는 것 우선). 없으면 null */
  hitTestObject(imagePoint: Point): string | null {
    const layers = [...this.objectLayers.values()].filter((l) => l.geometry && l.sprite.visible);
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const uv = imagePointToFixtureUv(layer.geometry!, imagePoint, layer.placement.flip_x);
      if (!uv) continue;
      const mask = layer.url ? this.alphaMasks.get(layer.url) : undefined;
      if (!mask) return layer.placement.id;
      const x = Math.min(ALPHA_PROBE - 1, Math.max(0, Math.floor(uv[0] * ALPHA_PROBE)));
      const y = Math.min(ALPHA_PROBE - 1, Math.max(0, Math.floor(uv[1] * ALPHA_PROBE)));
      if (mask[y * ALPHA_PROBE + x] > 24) return layer.placement.id;
    }
    return null;
  }

  setSelectedObject(id: string | null): void {
    if (this.selectedObjectId === id) return;
    this.selectedObjectId = id;
    this.updateSelectionBox();
    this.requestRender();
  }

  private updateSelectionBox(): void {
    if (this.selectionBox.parent !== this.objectRoot) this.objectRoot.addChild(this.selectionBox);
    this.objectRoot.setChildIndex(this.selectionBox, this.objectRoot.children.length - 1);
    this.selectionBox.clear();
    const layer = this.selectedObjectId && !this.exporting ? this.objectLayers.get(this.selectedObjectId) : null;
    const geo = layer?.geometry;
    if (!geo) {
      this.selectionBox.visible = false;
      return;
    }
    this.selectionBox.visible = true;
    const w = geo.widthPx;
    const h = geo.heightPx;
    this.selectionBox.position.set(geo.centerPx[0], geo.centerPx[1]);
    this.selectionBox.rotation = geo.rotationRad;
    this.selectionBox
      .rect(-w / 2, -h / 2, w, h)
      .stroke({ width: 2 / Math.max(0.01, this.camera.scale), color: 0x38bdf8, alpha: 0.95 });
  }

  /** 내보내기 동안 선택 표시를 감춘다 (카메라를 되돌리면 updateSelectionBox 가 다시 그리므로 플래그로 막는다) */
  private setSelectionVisible(visible: boolean): void {
    this.exporting = !visible;
    this.updateSelectionBox();
  }

  private disposeObjectLayer(layer: ObjectLayer): void {
    layer.container.parent?.removeChild(layer.container);
    layer.container.destroy({ children: true });
    layer.source?.destroy();
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

  /**
   * 현재 화면을 원본 해상도 PNG 로 내보낸다.
   * 카메라·뷰모드·선택 표시를 잠시 되돌려 한 프레임만 그린 뒤 원상 복구한다.
   * 색보정 필터는 stage 에 걸려 있으므로 내보낸 이미지에도 그대로 반영된다.
   */
  async exportPng(): Promise<Blob> {
    if (this.destroyed) throw new Error("렌더러가 이미 정리되었습니다.");
    if (this.imageWidth === 0 || this.imageHeight === 0) throw new Error("배경 이미지가 아직 준비되지 않았습니다.");

    const prev = {
      camera: this.camera,
      viewMode: this.viewMode,
      viewportW: this.viewportW,
      viewportH: this.viewportH,
      resolution: this.app.renderer.resolution,
      fadeAlpha: this.fade.alpha,
    };

    try {
      this.setSelectionVisible(false);
      if (this.viewMode !== "after") this.setViewMode("after");
      cancelAnimationFrame(this.fade.raf);
      this.fade.alpha = 0;
      this.fade.target = 0;
      this.applyView(false);
      this.app.renderer.resolution = 1;
      this.resize(this.imageWidth, this.imageHeight);
      this.setCamera({ scale: 1, x: 0, y: 0 });
      this.renderNow();
      const canvas = this.app.renderer.extract.canvas(this.app.stage) as HTMLCanvasElement;
      return await canvasToBlob(canvas, "image/png");
    } finally {
      this.app.renderer.resolution = prev.resolution;
      this.viewMode = prev.viewMode;
      this.fade.alpha = prev.fadeAlpha;
      this.applyView(false);
      this.resize(prev.viewportW, prev.viewportH);
      this.setCamera(prev.camera);
      this.setSelectionVisible(true);
      this.requestRender();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.fade.raf);
    for (const layer of this.layers.values()) this.disposeLayer(layer);
    this.layers.clear();
    for (const layer of this.objectLayers.values()) this.disposeObjectLayer(layer);
    this.objectLayers.clear();
    this.alphaMasks.clear();
    this.imageCache.clear();
    this.imageCacheOrder.length = 0;
    this.shadowTexture?.destroy(true);
    this.baseSource?.destroy();
    this.actualSource?.destroy();
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
