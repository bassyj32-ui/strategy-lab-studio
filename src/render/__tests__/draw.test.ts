import { describe, it, expect, vi } from 'vitest';
import { drawScene } from '../draw';
import type { Scene } from '../../scene/types';
import type { AssetImageMap } from '../types';

class MockCtx {
  fillStyleHistory: string[] = [];
  private _fillStyle = '';
  globalAlpha = 1;
  shadowColor = '';
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  save = vi.fn();
  restore = vi.fn();
  translate = vi.fn();
  rotate = vi.fn();
  scale = vi.fn();
  clearRect = vi.fn();
  fillRect = vi.fn();
  fillText = vi.fn();
  font = '';
  textBaseline = 'alphabetic';
  drawImage = vi.fn();
  beginPath = vi.fn();
  closePath = vi.fn();
  get fillStyle(): string {
    return this._fillStyle;
  }
  set fillStyle(v: string) {
    this._fillStyle = v;
    this.fillStyleHistory.push(v);
  }
}

function makeCtx() {
  const raw = new MockCtx();
  const ctx = raw as unknown as CanvasRenderingContext2D;
  return { ctx, raw };
}

function makeScene(): Scene {
  return {
    id: 's',
    name: 't',
    worldSize: { w: 1920, h: 1080 },
    assets: {},
    objects: {
      obj1: {
        id: 'obj1',
        type: 'unit',
        transform: { x: 100, y: 100, rotation: 0, scale: 1, opacity: 1 },
        layerId: 'layer-root',
      },
    },
    layers: [{ id: 'layer-root', name: 'Default', visible: true, order: 0 }],
    keyframes: {},
    camera: { x: 0, y: 0, zoom: 1 },
    timeline: { duration: 10, fps: 30 },
  };
}

describe('drawScene', () => {
  it('clears and fills the background color', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, makeScene(), 0, 30, { w: 1920, h: 1080 }, {});
    expect(raw.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(raw.fillStyleHistory).toContain('#0b0e14');
    expect(raw.fillRect).toHaveBeenCalled();
  });

  it('with no asset, draws a placeholder rect (no drawImage)', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, makeScene(), 0, 30, { w: 1920, h: 1080 }, {});
    expect(raw.drawImage).not.toHaveBeenCalled();
    const drewPlaceholder = raw.fillRect.mock.calls.some(
      (c) => c[0] === -20 && c[1] === -20 && c[2] === 40 && c[3] === 40
    );
    expect(drewPlaceholder).toBe(true);
  });

  it('with a loaded asset, draws the image (no placeholder)', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.objects.obj1.assetId = 'a1';
    scene.assets.a1 = {
      id: 'a1',
      kind: 'sprite',
      name: 'u',
      src: 'u.png',
      width: 64,
      height: 64,
    };
    const img = {} as HTMLImageElement;
    const images: AssetImageMap = { a1: img };
    drawScene(ctx, scene, 0, 30, { w: 1920, h: 1080 }, images);
    expect(raw.drawImage).toHaveBeenCalled();
    const drewPlaceholder = raw.fillRect.mock.calls.some(
      (c) => c[0] === -20 && c[1] === -20 && c[2] === 40 && c[3] === 40
    );
    expect(drewPlaceholder).toBe(false);
  });

  it('does NOT mutate the scene object', () => {
    const scene = makeScene();
    const before = JSON.parse(JSON.stringify(scene));
    const { ctx } = makeCtx();
    drawScene(ctx, scene, 5, 30, { w: 1920, h: 1080 }, {});
    expect(JSON.parse(JSON.stringify(scene))).toEqual(before);
  });

  it('skips invisible layers', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.layers[0].visible = false;
    drawScene(ctx, scene, 0, 30, { w: 1920, h: 1080 }, {});
    // only background fillRect, no placeholder for the object
    const drewPlaceholder = raw.fillRect.mock.calls.some(
      (c) => c[0] === -20 && c[1] === -20 && c[2] === 40 && c[3] === 40
    );
    expect(drewPlaceholder).toBe(false);
  });

  it('draws a LOUD banner when the declared map asset failed to load', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.mapAssetId = 'map1'; // declared, but images map has nothing
    drawScene(ctx, scene, 0, 30, { w: 1920, h: 1080 }, {});
    const banner = raw.fillText.mock.calls.some((c) =>
      String(c[0]).includes('MAP ASSET FAILED TO LOAD')
    );
    expect(banner).toBe(true);
  });

  it('draws NO banner when the map image loaded', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.mapAssetId = 'map1';
    scene.assets.map1 = {
      id: 'map1',
      kind: 'map',
      name: 'm',
      src: 'maps/m.png',
      width: 100,
      height: 100,
    };
    const img = { width: 100, height: 100 } as unknown as HTMLImageElement;
    drawScene(ctx, scene, 0, 30, { w: 1920, h: 1080 }, { map1: img });
    const banner = raw.fillText.mock.calls.some((c) =>
      String(c[0]).includes('MAP ASSET FAILED TO LOAD')
    );
    expect(banner).toBe(false);
  });

  // ---- Shadows (owner-approved P1 pull-forward; deterministic) ----

  /** Give obj1 a sprite asset whose metadata carries `defaultShadow`. */
  function makeShadowScene(withFlag: boolean): Scene {
    const scene = makeScene();
    scene.objects.obj1.assetId = 'a1';
    scene.assets.a1 = {
      id: 'a1',
      kind: 'sprite',
      name: 'u',
      src: 'u.png',
      width: 64,
      height: 64,
      metadata: {
        aspectRatio: 1,
        defaultScale: 1,
        ...(withFlag ? { defaultShadow: true } : {}),
      },
    };
    return scene;
  }

  const SHADOW_COLOR = 'rgba(0, 0, 0, 0.45)';

  it('sets fixed soft-shadow state when asset metadata.defaultShadow is true', () => {
    const { ctx, raw } = makeCtx();
    drawScene(
      ctx,
      makeShadowScene(true),
      0,
      30,
      { w: 1920, h: 1080 },
      { a1: {} as HTMLImageElement }
    );
    expect(raw.shadowColor).toBe(SHADOW_COLOR);
    expect(raw.shadowBlur).toBe(12); // SHADOW_BLUR * screen.scale(=1)
    expect(raw.shadowOffsetX).toBe(4);
    expect(raw.shadowOffsetY).toBe(6);
  });

  it('sets NO shadow state without defaultShadow metadata', () => {
    const { ctx, raw } = makeCtx();
    drawScene(
      ctx,
      makeShadowScene(false),
      0,
      30,
      { w: 1920, h: 1080 },
      { a1: {} as HTMLImageElement }
    );
    expect(raw.shadowColor).toBe('');
    expect(raw.shadowBlur).toBe(0);
    expect(raw.shadowOffsetX).toBe(0);
    expect(raw.shadowOffsetY).toBe(0);
  });

  it('shadow values are deterministic constants across repeated frames', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeShadowScene(true);
    const images = { a1: {} as HTMLImageElement };
    drawScene(ctx, scene, 3, 30, { w: 1920, h: 1080 }, images);
    const first = {
      c: raw.shadowColor,
      b: raw.shadowBlur,
      x: raw.shadowOffsetX,
      y: raw.shadowOffsetY,
    };
    drawScene(ctx, scene, 7, 30, { w: 1920, h: 1080 }, images);
    expect({
      c: raw.shadowColor,
      b: raw.shadowBlur,
      x: raw.shadowOffsetX,
      y: raw.shadowOffsetY,
    }).toEqual(first);
  });

  // ---- Alpha export mode (owner-approved P1 pull-forward) ----

  it('alpha mode skips the opaque background fill but still clears', () => {
    const { ctx, raw } = makeCtx();
    drawScene(
      ctx,
      makeScene(),
      0,
      30,
      { w: 1920, h: 1080 },
      {},
      { transparentBackground: true }
    );
    expect(raw.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(raw.fillStyleHistory).not.toContain('#0b0e14');
    const bgFill = raw.fillRect.mock.calls.some(
      (c) => c[0] === 0 && c[1] === 0 && c[2] === 1920 && c[3] === 1080
    );
    expect(bgFill).toBe(false);
  });

  it('alpha mode skips the map image AND suppresses the failure banner', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.mapAssetId = 'map1'; // declared, but NOT loaded -> banner case
    drawScene(
      ctx,
      scene,
      0,
      30,
      { w: 1920, h: 1080 },
      {},
      { transparentBackground: true }
    );
    expect(raw.fillText).not.toHaveBeenCalled(); // no banner
    expect(raw.drawImage).not.toHaveBeenCalled(); // no map
  });

  it('alpha mode still paints objects (placeholder visible)', () => {
    const { ctx, raw } = makeCtx();
    drawScene(
      ctx,
      makeScene(),
      0,
      30,
      { w: 1920, h: 1080 },
      {},
      { transparentBackground: true }
    );
    const drewPlaceholder = raw.fillRect.mock.calls.some(
      (c) => c[0] === -20 && c[1] === -20 && c[2] === 40 && c[3] === 40
    );
    expect(drewPlaceholder).toBe(true);
  });

  it('folds the parent transform so a grouped child renders at its world position', () => {
    const scene = makeScene();
    scene.objects = {
      p1: {
        id: 'p1',
        type: 'unit',
        transform: { x: 500, y: 300, rotation: 0, scale: 1, opacity: 1 },
        layerId: 'layer-root',
      },
      c1: {
        id: 'c1',
        type: 'unit',
        transform: { x: 10, y: 20, rotation: 0, scale: 1, opacity: 1 },
        parentId: 'p1',
        layerId: 'layer-root',
      },
    };
    const { ctx, raw } = makeCtx();
    drawScene(ctx, scene, 0, 30, { w: 1920, h: 1080 }, {});
    const calls = raw.translate.mock.calls.map((c) => ({
      x: Math.round(c[0] as number),
      y: Math.round(c[1] as number),
    }));
    // camera {0,0} zoom 1, video 1920x1080 => screen = (960+wx, 540+wy).
    // child world = p1(500,300) + local(10,20) = (510,320) => (1470, 860)
    // parent world = (500,300) => (1460, 840)
    expect(calls.some((p) => p.x === 1470 && p.y === 860)).toBe(true);
    expect(calls.some((p) => p.x === 1460 && p.y === 840)).toBe(true);
  });
});
