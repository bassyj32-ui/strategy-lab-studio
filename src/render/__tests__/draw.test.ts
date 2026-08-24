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
  textAlign = 'start';
  strokeStyle = '';
  lineWidth = 0;
  arc = vi.fn();
  stroke = vi.fn();
  measureText = vi.fn((text: string) => ({ width: text.length * 7 }));
  createRadialGradient = vi.fn(() => ({ addColorStop: vi.fn() }));
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

describe('drawScene', () => {  it('clears and fills the background color', () => {
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

describe('drawScene: animated camera (camera track)', () => {
  it('evaluates the track per frame — the applied view moves with time', () => {
    const scene = makeScene();
    scene.cameraTrack = [
      { time: 0, cam: { x: 0, y: 0, zoom: 1 } },
      { time: 1, cam: { x: 300, y: 60, zoom: 1 } },
    ];
    const f0 = makeCtx();
    drawScene(f0.ctx, scene, 0, 30, { w: 1920, h: 1080 }, {});
    const f15 = makeCtx();
    drawScene(f15.ctx, scene, 15, 30, { w: 1920, h: 1080 }, {});
    const tx = (m: MockCtx): number =>
      (m.translate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // frame 15 = t=0.5s -> midpoint x=150. Object at world (100,100):
    // ox = 100 - camX shifts by -150 between frames.
    expect(tx(f15.raw) - tx(f0.raw)).toBeCloseTo(-150, 6);
  });

  it('no-track scenes are byte-identical to pre-track behaviour', () => {
    const sceneA = makeScene();
    const sceneB = makeScene();
    sceneB.cameraTrack = [];
    const a = makeCtx();
    drawScene(a.ctx, sceneA, 7, 30, { w: 1920, h: 1080 }, {});
    const b = makeCtx();
    drawScene(b.ctx, sceneB, 7, 30, { w: 1920, h: 1080 }, {});
    expect(JSON.stringify(a.raw.fillStyleHistory)).toBe(
      JSON.stringify(b.raw.fillStyleHistory)
    );
    for (const m of ['translate', 'scale'] as const) {
      expect((a.raw[m] as ReturnType<typeof vi.fn>).mock.calls).toEqual(
        (b.raw[m] as ReturnType<typeof vi.fn>).mock.calls
      );
    }
  });

  it('same scene + frame paints identically across runs (determinism)', () => {
    const mkScene = (): Scene => ({
      ...makeScene(),
      cameraTrack: [
        { time: 0, cam: { x: 10, y: 20, zoom: 2 } },
        { time: 2, cam: { x: 110, y: 120, zoom: 3 } },
      ],
    });
    const run = (): string => {
      const c = makeCtx();
      drawScene(c.ctx, mkScene(), 45, 30, { w: 1920, h: 1080 }, {});
      const m = c.raw as unknown as Record<string, { mock?: { calls?: unknown[] } }>;
      return JSON.stringify([
        c.raw.fillStyleHistory,
        m['translate']?.mock?.calls,
        m['scale']?.mock?.calls,
      ]);
    };
    expect(run()).toBe(run());
  });
});

describe('commander annotations (faction ring / name label / confidence badge)', () => {
  const annotated = (over: Record<string, unknown>): Scene => {
    const scene = makeScene();
    scene.objects.obj1.type = 'marker';
    Object.assign(scene.objects.obj1, over);
    return scene;
  };

  it('strokes a faction-colored ring around the object', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, annotated({ faction: 'red' }), 0, 30, { w: 1920, h: 1080 }, {});
    expect(raw.arc).toHaveBeenCalled();
    expect(raw.stroke).toHaveBeenCalled();
    expect(raw.strokeStyle).toBe('#ef4444');
  });

  it('paints a dark chip + the commander label in screen space', () => {
    const { ctx, raw } = makeCtx();
    drawScene(
      ctx,
      annotated({ label: 'Alexander' }),
      0,
      30,
      { w: 1920, h: 1080 },
      {}
    );
    expect(raw.measureText).toHaveBeenCalledWith('Alexander');
    expect(raw.fillText.mock.calls.some((c) => c[0] === 'Alexander')).toBe(true);
    // Chip rect is wider than the measured text (padding on both sides).
    const chip = raw.fillRect.mock.calls.find(
      (c) => c[2] === 'Alexander'.length * 7 + 16
    );
    expect(chip).toBeTruthy();
  });

  it('paints the confidence badge text with its level color', () => {
    const { ctx, raw } = makeCtx();
    drawScene(
      ctx,
      annotated({ confidence: 'confirmed' }),
      0,
      30,
      { w: 1920, h: 1080 },
      {}
    );
    expect(raw.fillText.mock.calls.some((c) => c[0] === 'CONFIRMED')).toBe(true);
    expect((raw as unknown as { fillStyle: string }).fillStyle).toBe('#22c55e');
  });

  it('draws NO annotation text when none of the fields are set', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, annotated({}), 0, 30, { w: 1920, h: 1080 }, {});
    expect(raw.fillText).not.toHaveBeenCalled();
    expect(raw.arc).not.toHaveBeenCalled();
  });
});

describe('vignette (§38 decisive move)', () => {
  it('paints a full-frame radial gradient when scene.vignette is set', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.vignette = true;
    drawScene(ctx, scene, 0, 30, { w: 1920, h: 1080 }, {});
    expect(raw.createRadialGradient).toHaveBeenCalledTimes(1);
    // Full-frame fill drawn with the gradient as the fill style.
    const gradFill = raw.fillRect.mock.calls.some(
      (c) => c[0] === 0 && c[1] === 0 && c[2] === 1920 && c[3] === 1080
    );
    expect(gradFill).toBe(true);
    // fillStyle was set to the gradient object createRadialGradient returned.
    const grad = (raw.createRadialGradient as ReturnType<typeof vi.fn>).mock
      .results[0].value;
    expect((raw as unknown as { fillStyle: unknown }).fillStyle).toBe(grad);
  });

  it('skips the vignette in alpha mode (transparent overlay is objects-only)', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.vignette = true;
    drawScene(ctx, scene, 0, 30, { w: 1920, h: 1080 }, {}, { transparentBackground: true });
    expect(raw.createRadialGradient).not.toHaveBeenCalled();
  });

  it('draws nothing extra when the flag is absent', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, makeScene(), 0, 30, { w: 1920, h: 1080 }, {});
    expect(raw.createRadialGradient).not.toHaveBeenCalled();
  });
});

describe('z-depth paint order (§48)', () => {
  const twoObjs = (flip: boolean): Scene => {
    const scene = makeScene();
    scene.objects.obj1.type = 'marker';
    scene.objects.obj2 = {
      id: 'obj2',
      type: 'marker',
      transform: { x: 500, y: 100, rotation: 0, scale: 1, opacity: 1 },
      layerId: 'layer-root',
    };
    if (flip) {
      scene.objects.obj1.z = 1;
    } else {
      scene.objects.obj2.z = 1;
    }
    return scene;
  };

  const xOrder = (raw: MockCtx): number[] =>
    raw.translate.mock.calls.map((c) => c[0] as number);

  it('higher z paints later', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, twoObjs(false), 0, 30, { w: 1920, h: 1080 }, {});
    const xs = xOrder(raw);
    // applyCamera centres world origin in the video frame (+960 on x).
    expect(xs.indexOf(1060)).toBeLessThan(xs.indexOf(1460));
  });

  it('flipping z flips the paint order (editor parity via sortForRender)', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, twoObjs(true), 0, 30, { w: 1920, h: 1080 }, {});
    const xs = xOrder(raw);
    expect(xs.indexOf(1060)).toBeGreaterThan(xs.indexOf(1460));
  });
});
