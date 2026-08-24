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
  fill = vi.fn();
  measureText = vi.fn((text: string) => ({ width: text.length * 7 }));
  createRadialGradient = vi.fn(() => ({ addColorStop: vi.fn() }));
  moveTo = vi.fn();
  lineTo = vi.fn();
  setLineDash = vi.fn();
  lineCap = 'butt';
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

describe('procedural effects (§50)', () => {
  const withEffect = (effect: 'fire' | 'impact' | undefined): Scene => {
    const scene = makeScene();
    scene.objects.obj1.type = 'marker';
    if (effect) scene.objects.obj1.effect = effect;
    return scene;
  };

  it('paints expanding rings in the effect colour when obj.effect is set', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, withEffect('fire'), 0.2, 30, { w: 1920, h: 1080 }, {});
    // Fire's halo colour must appear among fills; arcs beyond the base shape
    // prove the rings were drawn (marker body itself is not arc-based).
    expect(raw.fillStyleHistory).toContain('#ef6a2a');
    expect(raw.arc.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('paints NO effect rings when obj.effect is absent', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, withEffect(undefined), 0.2, 30, { w: 1920, h: 1080 }, {});
    expect(raw.fillStyleHistory).not.toContain('#ef6a2a');
  });

  it('ring radii grow over the cycle (animated, deterministic)', () => {
    const maxArcRadiusAt = (t: number): number[] => {
      const { ctx, raw } = makeCtx();
      drawScene(ctx, withEffect('impact'), t, 30, { w: 1920, h: 1080 }, {});
      return raw.arc.mock.calls.map((c) => c[2] as number);
    };
    const early = Math.max(...maxArcRadiusAt(0.05));
    const late = Math.max(...maxArcRadiusAt(0.5));
    expect(late).toBeGreaterThan(early);
    // Deterministic: same frame → identical radii sequence.
    expect(JSON.stringify(maxArcRadiusAt(0.05))).toBe(
      JSON.stringify(maxArcRadiusAt(0.05))
    );
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

describe('layer parallax via depthFactor (§46)', () => {
  const parallaxScene = (aFactor: number | undefined): Scene => {
    const scene = makeScene();
    scene.layers = [
      { id: 'layer-a', name: 'A', visible: true, order: 0, depthFactor: aFactor },
      { id: 'layer-b', name: 'B', visible: true, order: 1 },
    ];
    scene.objects.obj1.layerId = 'layer-a';
    scene.objects.obj2 = {
      id: 'obj2',
      type: 'marker',
      transform: { x: 100, y: 100, rotation: 0, scale: 1, opacity: 1 },
      layerId: 'layer-b',
    };
    // Panned camera so a depth-factor difference must show up in screen space.
    scene.camera = { x: 400, y: 0, zoom: 1 };
    return scene;
  };

  it('a pinned layer (depthFactor 0) diverges from a full-speed layer under a panned camera', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, parallaxScene(0), 0, 30, { w: 1920, h: 1080 }, {});
    // Both markers sit at world x=100; their paint-time translate differs
    // only through the layer's effective camera:
    //   f=1 → cam.x 400 → (100−400)+960 = 660 (follows the pan)
    //   f=0 → cam pinned to world centre 960 → (100−960)+960 = 100
    const xs = new Set(raw.translate.mock.calls.map((c) => c[0] as number));
    expect(xs).toContain(660);
    expect(xs).toContain(100);
  });

  it('depthFactor 1 everywhere is byte-identical to no depthFactor at all', () => {
    const run = (factor: number | undefined): string => {
      const { ctx, raw } = makeCtx();
      drawScene(ctx, parallaxScene(factor), 0, 30, { w: 1920, h: 1080 }, {});
      return JSON.stringify(raw.translate.mock.calls);
    };
    expect(run(undefined)).toBe(run(1));
  });
});

// ---- §32 signature arrow styles (shared spec table, canvas door) ----

describe('signature arrow styles in drawScene', () => {
  const arrowScene = (arrowStyle?: string, length = 200): Scene => {
    const scene = makeScene();
    scene.objects.obj1.type = 'arrow';
    scene.objects.obj1.length = length;
    if (arrowStyle) scene.objects.obj1.arrowStyle = arrowStyle as never;
    return scene;
  };

  it('no style renders the LEGACY geometry (attack spec, solid, opaque)', () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, arrowScene(), 0, 30, { w: 1920, h: 1080 }, {});
    // zoom 1 → scale 1 → legacy shaft width 6.
    expect(raw.lineWidth).toBe(6);
    // Solid shaft: the only setLineDash call is the head's reset to [].
    for (const call of raw.setLineDash.mock.calls) {
      expect(call[0]).toEqual([]);
    }
    expect(raw.globalAlpha).toBe(1); // restored after the object
  });

  it("explicit 'charge' scales the stroke with the shared spec", () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, arrowScene('charge'), 0, 30, { w: 1920, h: 1080 }, {});
    expect(raw.lineWidth).toBe(8); // charge.shaftWidth
  });

  it("'movement' strokes a world-scaled dash rhythm and keeps the head solid", () => {
    const { ctx, raw } = makeCtx();
    drawScene(ctx, arrowScene('movement'), 0, 30, { w: 1920, h: 1080 }, {});
    const dashCalls = raw.setLineDash.mock.calls.map((c) => c[0]);
    expect(dashCalls).toContainEqual([12, 8]); // [12,8] * scale(=1)
    expect(dashCalls[dashCalls.length - 1]).toEqual([]); // head solid
  });

  it('style opacity multiplies into globalAlpha while painting (retreat 0.7)', () => {
    const { ctx, raw } = makeCtx();
    const scene = arrowScene('retreat');
    // Sample alpha DURING the paint by intercepting stroke().
    let seen = 1;
    const origStroke = ctx.stroke.bind(ctx);
    ctx.stroke = (() => {
      seen = (ctx as unknown as { globalAlpha: number }).globalAlpha;
      origStroke();
    }) as typeof ctx.stroke;
    drawScene(ctx, scene, 0, 30, { w: 1920, h: 1080 }, {});
    expect(seen).toBeCloseTo(0.7);
    // The arrow branch wraps its alpha in save/restore.
    expect(raw.save).toHaveBeenCalled();
    expect(raw.restore).toHaveBeenCalled();
  });

  it('both doors read the SAME spec: zoomed camera scales width + dash together', () => {
    const scene = arrowScene('movement');
    scene.camera = { x: 0, y: 0, zoom: 2 };
    const { ctx, raw } = makeCtx();
    drawScene(ctx, scene, 0, 30, { w: 1920, h: 1080 }, {});
    expect(raw.lineWidth).toBeCloseTo(8); // movement.shaftWidth(4) * 2
    expect(raw.setLineDash.mock.calls[0][0]).toEqual([24, 16]); // dash * 2
  });

  it("brand faction overrides flow into the annotation ring stroke", () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.objects.obj1.faction = 'red';
    scene.brand = { factionColors: { red: '#00ff88' } };
    drawScene(ctx, scene, 0, 30, { w: 1920, h: 1080 }, {});
    expect(raw.strokeStyle).toBe('#00ff88');
  });
});

// ---- §95/§96 title cards (signature opening / ending overlay pass) ----

describe('title cards in drawScene', () => {
  it('opening card paints the veil + kicker + title inside its window', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.openingCard = {};
    drawScene(ctx, scene, 30, 30, { w: 1920, h: 1080 }, {}); // t=1s < 3s window
    // Veil = a SECOND #0b0e14 fill on top of the background wash.
    const darkFills = raw.fillStyleHistory.filter((c) => c === '#0b0e14');
    expect(darkFills.length).toBeGreaterThanOrEqual(2);
    const texts = raw.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toContain('STRATEGY LAB'); // default kicker
    expect(texts).toContain('t'); // title falls back to scene.name
  });

  it('card text resolves brand battleName/dateLine at render time', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.name = 'Untitled';
    scene.brand = { battleName: 'Gaugamela', dateLine: '331 BC' };
    scene.openingCard = {};
    drawScene(ctx, scene, 45, 30, { w: 1920, h: 1080 }, {}); // t=1.5s
    const texts = raw.fillText.mock.calls.map((c) => String(c[0]));
    expect(texts).toContain('GAUGAMELA'); // kicker from battleName (uppercased)
    expect(texts).toContain('Gaugamela'); // display title is verbatim
    expect(texts).toContain('331 BC'); // dateLine uppercased (already caps)
  });

  it('card text prefers explicit card config over brand tokens', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.name = 'Fallback';
    scene.brand = { battleName: 'Brand Title', dateLine: 'Brand Date' };
    scene.openingCard = {
      kicker: 'Custom Kick',
      title: 'Custom Title',
      subtitle: 'Custom Sub',
    };
    drawScene(ctx, scene, 45, 30, { w: 1920, h: 1080 }, {}); // t=1.5s
    const texts = raw.fillText.mock.calls.map((c) => String(c[0]));
    expect(texts).toContain('CUSTOM KICK'); // kicker uppercased
    expect(texts).toContain('Custom Title');
    expect(texts).toContain('CUSTOM SUB'); // subtitle uppercased
    expect(texts).not.toContain('Brand Title');
  });

  it('closing card hugs the timeline END (visible late, absent early)', () => {
    const mk = (): Scene => {
      const scene = makeScene(); // duration 10
      scene.closingCard = {};
      return scene;
    };
    const late = makeCtx();
    drawScene(late.ctx, mk(), 285, 30, { w: 1920, h: 1080 }, {}); // t=9.5s: in [7,10]
    expect(
      late.raw.fillText.mock.calls.some((c) => c[0] === 'THE LESSON')
    ).toBe(true);
    const early = makeCtx();
    drawScene(early.ctx, mk(), 150, 30, { w: 1920, h: 1080 }, {}); // t=5s: outside
    expect(early.raw.fillText.mock.calls.some((c) => c[0] === 'THE LESSON')).toBe(
      false
    );
  });

  it('cards are skipped OUTSIDE their fade windows (no veil)', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.openingCard = {};
    drawScene(ctx, scene, 120, 30, { w: 1920, h: 1080 }, {}); // t=4s: past the card
    // Only the background wash — no card veil was layered on top.
    expect(raw.fillStyleHistory.filter((c) => c === '#0b0e14')).toHaveLength(1);
    expect(raw.fillText).not.toHaveBeenCalled();
  });

  it('alpha mode skips BOTH cards even when configured (objects-only output)', () => {
    const { ctx, raw } = makeCtx();
    const scene = makeScene();
    scene.openingCard = {};
    scene.closingCard = {};
    drawScene(
      ctx,
      scene,
      1,
      30,
      { w: 1920, h: 1080 },
      {},
      { transparentBackground: true }
    );
    expect(raw.fillText).not.toHaveBeenCalled();
    const veil = raw.fillRect.mock.calls.find(
      (c) => c[0] === 0 && c[1] === 0 && c[2] === 1920 && c[3] === 1080
    );
    expect(veil).toBeUndefined();
  });

  it('card painting is deterministic per frame', () => {
    const run = (): string => {
      const scene = makeScene();
      scene.openingCard = {};
      const c = makeCtx();
      drawScene(c.ctx, scene, 1, 30, { w: 1920, h: 1080 }, {});
      return JSON.stringify([
        c.raw.fillStyleHistory,
        (c.raw.fillText as ReturnType<typeof vi.fn>).mock.calls,
        (c.raw.fillRect as ReturnType<typeof vi.fn>).mock.calls,
      ]);
    };
    expect(run()).toBe(run());
  });
});
