import { describe, it, expect, vi } from 'vitest';
import { drawScene } from '../draw';
import type { Scene } from '../../scene/types';
import type { AssetImageMap } from '../types';

class MockCtx {
  fillStyleHistory: string[] = [];
  private _fillStyle = '';
  globalAlpha = 1;
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
});
