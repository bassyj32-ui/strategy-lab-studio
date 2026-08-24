import { describe, it, expect } from 'vitest';
import { buildDecisiveMove, buildWhyItWorked } from './macros';
import { createDefaultScene } from './factory';
import type { Scene } from './types';
import { MAX_ZOOM, MIN_ZOOM } from '../camera/cameraMath';

// Deterministic payload builder: ids are fresh per call, so shape tests
// compare positions/times rather than identities.
const run = (opts = {}) => buildDecisiveMove(createDefaultScene(), opts);

describe('buildDecisiveMove (PRD §38)', () => {
  it('pushes the camera onto the focus with dramatic timing hold', () => {
    const r = run({ focus: { x: 800, y: 400 } });
    expect(r.cameraKeys.map((k) => k.time)).toEqual([0, 0.7, 2]); // 35% hold
    const last = r.cameraKeys[2].cam;
    expect(last).toEqual({ x: 800, y: 400, zoom: 2.2 });
    // First key holds the establishing view (default camera centre).
    expect(r.cameraKeys[0].cam).toEqual({ x: 960, y: 540, zoom: 1 });
  });

  it('skips the hold without dramaticTiming', () => {
    const r = run({ focus: { x: 800, y: 400 }, dramaticTiming: false });
    expect(r.cameraKeys.map((k) => k.time)).toEqual([0, 2]);
  });

  it('creates a highlight marker at the focus and an arrow pointing at it', () => {
    const r = run({ focus: { x: 800, y: 400 }, pulse: false });
    expect(r.objects.map((o) => o.type)).toEqual(['marker', 'arrow']);
    const marker = r.objects[0];
    expect(marker.transform.x).toBe(800);
    expect(marker.transform.y).toBe(400);
    expect(marker.id).toBe(r.highlightId);
    const arrow = r.objects[1];
    // Arrow tail sits up-left by default; its rotation aims at the focus.
    expect(arrow.transform.x).toBeLessThan(800);
    expect(arrow.length).toBeCloseTo(Math.hypot(420, 320));
    expect(arrow.transform.rotation).toBeCloseTo(
      (Math.atan2(320, 420) * 180) / Math.PI
    );
  });

  it('pulse writes oscillating opacity keys across the move window', () => {
    const r = run({ focus: { x: 800, y: 400 } });
    const frames = r.keyframes[r.highlightId]!;
    expect(frames).toHaveLength(7); // 3 pulses → 6 segments + close
    expect(frames[0].time).toBe(0);
    expect(frames[6].time).toBe(2);
    expect(frames[0].transform.opacity).toBe(1);
    expect(frames[1].transform.opacity).toBe(0.35);
    expect(frames[5].transform.opacity).toBe(0.35);
  });

  it('honours startAt/duration/zoom and clamps zoom to the editor range', () => {
    const r = run({ startAt: 3, duration: 1.5, zoom: 99 });
    expect(r.cameraKeys[0].time).toBe(3);
    expect(r.cameraKeys[r.cameraKeys.length - 1].time).toBe(4.5);
    expect(r.cameraKeys[r.cameraKeys.length - 1].cam.zoom).toBe(MAX_ZOOM);
    const low =
      run({ zoom: -5 }).cameraKeys[run({ zoom: -5 }).cameraKeys.length - 1].cam
        .zoom;
    expect(low).toBe(MIN_ZOOM);
  });

  it('is deterministic apart from fresh ids', () => {
    const a = run({ focus: { x: 10, y: 20 } });
    const b = run({ focus: { x: 10, y: 20 } });
    const strip = (r: ReturnType<typeof run>) =>
      JSON.stringify({
        cameraKeys: r.cameraKeys,
        // Sort by type so id differences (marker vs arrow ordering) can't leak.
        objects: r.objects
          .map((o) => ({ ...o, id: undefined }))
          .sort((x, y) => x.type.localeCompare(y.type)),
        keyframes: Object.values(r.keyframes).flat(),
        vignette: r.vignette,
      });
    expect(strip(a)).toBe(strip(b));
  });
});

describe('buildWhyItWorked (PRD §39)', () => {
  const factionScene = (): Scene => {
    const scene = createDefaultScene();
    const layerId = scene.layers[0].id;
    scene.objects.a = {
      id: 'a',
      type: 'unit',
      faction: 'red',
      transform: { x: 100, y: 100, rotation: 0, scale: 1, opacity: 1 },
      layerId,
    };
    scene.objects.b = {
      id: 'b',
      type: 'unit',
      faction: 'blue',
      transform: { x: 400, y: 300, rotation: 0, scale: 1, opacity: 0.8 },
      layerId,
    };
    return scene;
  };

  it('holds the current view briefly, then settles to the world-centre overview', () => {
    const scene = createDefaultScene();
    scene.camera = { x: 700, y: 420, zoom: 1.9 };
    const r = buildWhyItWorked(scene, {});
    expect(r.cameraKeys.map((k) => k.time)).toEqual([0, 0.75, 3]); // 25% hold
    expect(r.cameraKeys[0].cam).toEqual({ x: 700, y: 420, zoom: 1.9 });
    expect(r.cameraKeys[2].cam).toEqual({ x: 960, y: 540, zoom: 1.2 });
  });

  it('pulses ONLY the chosen faction\u2019s units, gently, from their own opacity', () => {
    const r = buildWhyItWorked(factionScene(), { faction: 'blue' });
    expect(r.pulsedIds).toEqual(['b']);
    const frames = r.keyframes['b']!;
    expect(frames).toHaveLength(5); // 2 gentle pulses → 4 segments + close
    expect(frames[0].time).toBe(0);
    expect(frames[4].time).toBe(3);
    // Rest state comes from the object's OWN opacity; floor is calm (0.55).
    expect(frames[0].transform.opacity).toBe(0.8);
    expect(frames[1].transform.opacity).toBe(0.55);
  });

  it('writes no keyframes without a faction or with pulse off', () => {
    expect(buildWhyItWorked(factionScene(), {}).pulsedIds).toEqual([]);
    const off = buildWhyItWorked(factionScene(), {
      faction: 'red',
      pulse: false,
    });
    expect(off.keyframes).toEqual({});
    expect(off.pulsedIds).toEqual([]);
  });

  it('honours startAt/duration/zoom and clamps zoom to the editor range', () => {
    const r = buildWhyItWorked(createDefaultScene(), {
      startAt: 2,
      duration: 2,
      zoom: 99,
    });
    const lastKey = r.cameraKeys[r.cameraKeys.length - 1];
    expect(lastKey.time).toBe(4);
    expect(lastKey.cam.zoom).toBe(MAX_ZOOM);
    const low =
      buildWhyItWorked(createDefaultScene(), { zoom: -5 }).cameraKeys[
        buildWhyItWorked(createDefaultScene(), { zoom: -5 }).cameraKeys.length -
          1
      ].cam.zoom;
    expect(low).toBe(MIN_ZOOM);
  });

  it('is deterministic apart from nothing at all (no ids created)', () => {
    const a = buildWhyItWorked(factionScene(), { faction: 'red', vignette: true });
    const b = buildWhyItWorked(factionScene(), { faction: 'red', vignette: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.vignette).toBe(true);
  });
});
