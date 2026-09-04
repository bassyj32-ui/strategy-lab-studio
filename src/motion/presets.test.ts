import { describe, it, expect } from 'vitest';
import {
  buildCameraPush,
  buildCharge,
  buildMarch,
  buildMotionPreset,
  buildSettle,
  buildVolley,
} from './presets';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';
import { createSceneObject } from '../objects/factory';
import type { Scene } from '../scene/types';

/** Scene with two root units at (100,100) and (200,100). */
function twoUnitScene(): Scene {
  const scene = createDefaultScene();
  for (const [id, x] of [['u1', 100], ['u2', 200]] as const) {
    const obj = createSceneObject('unit', { id, layerId: DEFAULT_LAYER_ID, x, y: 100 });
    scene.objects[id] = obj;
  }
  return scene;
}

describe('buildMarch', () => {
  it('staggers starts, keeps LINEAR segments, preserves the formation', () => {
    const r = buildMarch(twoUnitScene(), {
      ids: ['u1', 'u2'],
      anchor: { x: 1000, y: 500 },
      startAt: 0,
      duration: 3,
      stagger: 0.5,
    });
    expect(r.keyframes.u1.map((k) => k.time)).toEqual([0, 3]);
    expect(r.keyframes.u2.map((k) => k.time)).toEqual([0.5, 3.5]);
    expect(r.keyframes.u1[0].easing).toBe('linear');
    // Centroid (150,100) lands on the anchor; offsets (-50,0)/(+50,0) kept.
    expect(r.keyframes.u1[1].transform.x).toBe(950);
    expect(r.keyframes.u1[1].transform.y).toBe(500);
    expect(r.keyframes.u2[1].transform.x).toBe(1050);
    expect(r.keyframes.u2[1].transform.y).toBe(500);
    // Start poses untouched (commander keeps whatever rotation/scale/opacity).
    expect(r.keyframes.u1[0].transform).toEqual(
      twoUnitScene().objects.u1.transform
    );
  });

  it('returns empty payloads for empty/unknown ids', () => {
    expect(buildMarch(twoUnitScene(), {})).toEqual({ keyframes: {}, cameraKeys: [] });
    expect(buildMarch(twoUnitScene(), { ids: ['ghost'] })).toEqual({
      keyframes: {},
      cameraKeys: [],
    });
  });

  it('merges into existing tracks: preset keys win collisions, others survive', () => {
    const scene = twoUnitScene();
    scene.keyframes.u1 = [
      { time: 0, transform: { ...scene.objects.u1.transform } },
      { time: 9, transform: { ...scene.objects.u1.transform, x: 5 } },
    ];
    const r = buildMarch(scene, {
      ids: ['u1'],
      anchor: { x: 1000, y: 500 },
      duration: 3,
      stagger: 0,
    });
    // time-0 preset key replaces the old one; time-9 survives; end lands at 3.
    expect(r.keyframes.u1.map((k) => k.time)).toEqual([0, 3, 9]);
    expect(r.keyframes.u1[0].transform.x).toBe(100);
  });

  it('marches a grouped unit via world-space planning (local frame round-trip)', () => {
    const scene = createDefaultScene();
    const g = createSceneObject('group', { id: 'g', layerId: DEFAULT_LAYER_ID, x: 500, y: 0 });
    scene.objects.g = g;
    const u = createSceneObject('unit', { id: 'u', layerId: DEFAULT_LAYER_ID, x: 100, y: 100 });
    u.parentId = 'g';
    scene.objects.u = u;
    // World pos = (600,100); single unit so the anchor IS the world end.
    const r = buildMarch(scene, { ids: ['u'], anchor: { x: 900, y: 400 } });
    // Local end = world end minus the group offset.
    expect(r.keyframes.u[1].transform.x).toBe(400);
    expect(r.keyframes.u[1].transform.y).toBe(400);
  });
});

describe('buildCharge', () => {
  it('accelerates (easeIn) along a smoothly bowed arc, no end kinks', () => {
    const scene = twoUnitScene();
    const r = buildCharge(scene, {
      ids: ['u1'],
      anchor: { x: 400, y: 100 },
      duration: 1.6,
      stagger: 0,
    });
    const [start, end] = r.keyframes.u1;
    expect(start.easing).toBe('easeIn');
    // Travel (100,100)->centre lands single unit on anchor: dx=300, dy=0.
    // Left-of-travel normal (0,+1); tangent weight 0.3*300 = 90.
    expect(start.cpOut).toBeDefined();
    expect(end.cpIn).toBeDefined();
    expect(start.cpOut!.dx).toBeCloseTo(90);
    expect(start.cpOut!.dy).toBeGreaterThan(0); // bowed sideways…
    expect(end.cpIn!.dx).toBeCloseTo(-90);
    expect(end.cpIn!.dy).toBeCloseTo(start.cpOut!.dy); // …symmetrically
  });

  it('falls back to a straight easeIn when the unit goes nowhere', () => {
    const scene = twoUnitScene();
    const r = buildCharge(scene, { ids: ['u1'], anchor: { x: 150, y: 100 }, stagger: 0 });
    // Centroid == start for one unit... anchor (150,100) vs world (100,100):
    // travel exists here; use the unit's own spot for zero travel instead.
    expect(r.keyframes.u1[0].easing).toBe('easeIn');
    const zero = buildCharge(scene, { ids: ['u2'], anchor: { x: 200, y: 100 }, stagger: 0 });
    expect(zero.keyframes.u2[0].cpOut).toBeUndefined();
    expect(zero.keyframes.u2[1].cpIn).toBeUndefined();
  });
});

describe('buildVolley', () => {
  function arrowScene(n: number): { scene: Scene; ids: string[] } {
    const scene = createDefaultScene();
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = `a${i}`;
      scene.objects[id] = createSceneObject('arrow', {
        id,
        layerId: DEFAULT_LAYER_ID,
        x: 100 + i * 10,
        y: 700,
      });
      ids.push(id);
    }
    return { scene, ids };
  }

  it('arcs upward with tight stagger and lands the first arrow on the anchor', () => {
    const { scene, ids } = arrowScene(3);
    const r = buildVolley(scene, { ids, anchor: { x: 900, y: 300 } });
    expect(r.keyframes.a0.map((k) => k.time)).toEqual([0, 1.2]);
    expect(r.keyframes.a1.map((k) => k.time)).toEqual([0.08, 1.28]);
    expect(r.keyframes.a2.map((k) => k.time)).toEqual([0.16, 1.36]);
    // Upward apex: world -y bow on both handles.
    expect(r.keyframes.a0[0].cpOut!.dy).toBeLessThan(0);
    expect(r.keyframes.a0[1].cpIn!.dy).toBeLessThan(0);
    // First arrow of the ring lands exactly on the anchor.
    expect(r.keyframes.a0[1].transform.x).toBe(900);
    expect(r.keyframes.a0[1].transform.y).toBe(300);
  });

  it('scatters arrows deterministically (storm, not stack)', () => {
    const { scene, ids } = arrowScene(9);
    const first = buildVolley(scene, { ids, anchor: { x: 900, y: 300 } });
    const second = buildVolley(scene, { ids, anchor: { x: 900, y: 300 } });
    const ends = ids.map((id) => first.keyframes[id][1].transform);
    const uniq = new Set(ends.map((t) => `${t.x},${t.y}`));
    expect(uniq.size).toBe(9);
    expect(first).toEqual(second); // no RNG anywhere
  });
});

describe('buildSettle', () => {
  it('eases only the final arrival, never overwrites commander easing', () => {
    const scene = twoUnitScene();
    const t = (x: number) => ({ ...scene.objects.u1.transform, x });
    scene.keyframes.u1 = [
      { time: 0, transform: t(100) },
      { time: 2, transform: t(300), easing: 'linear' as const },
      { time: 4, transform: t(500) },
    ];
    scene.keyframes.u2 = [{ time: 1, transform: t(200) }]; // too short: skipped
    const r = buildSettle(scene, { ids: ['u1', 'u2', 'ghost'] });
    // Final segment starts at index 1, which already has easing → untouched.
    expect(r.keyframes.u1[0].easing).toBeUndefined();
    expect(r.keyframes.u1[1].easing).toBe('linear'); // commander's: untouched
    expect(r.keyframes.u1[2].transform.x).toBe(500);
    expect(r.keyframes.u2).toBeUndefined();
  });

  it('fills easeOut on an un-eased final segment', () => {
    const scene = twoUnitScene();
    const t = (x: number) => ({ ...scene.objects.u1.transform, x });
    scene.keyframes.u1 = [
      { time: 0, transform: t(100) },
      { time: 4, transform: t(500) },
    ];
    const r = buildSettle(scene, { ids: ['u1'] });
    expect(r.keyframes.u1).toHaveLength(2);
    expect(r.keyframes.u1[0].easing).toBe('easeOut');
    expect(r.keyframes.u1[1].transform.x).toBe(500);
  });
});

describe('buildCameraPush', () => {
  it('APPENDS hold-then-push keys; existing track survives', () => {
    const scene = createDefaultScene();
    scene.cameraTrack = [
      { time: 0, cam: { x: 960, y: 540, zoom: 1 } },
      { time: 5, cam: { x: 400, y: 300, zoom: 1.5 } },
    ];
    const r = buildCameraPush(scene, {
      anchor: { x: 800, y: 400 },
      startAt: 6,
      duration: 2,
      zoom: 2.5,
    });
    expect(r.keyframes).toEqual({});
    expect(r.cameraKeys.map((k) => k.time)).toEqual([0, 5, 6, 6.7, 8]);
    // Hold: same view twice (base = last key @5), then the push.
    expect(r.cameraKeys[2].cam).toEqual({ x: 400, y: 300, zoom: 1.5, rotation: 0 });
    expect(r.cameraKeys[3].cam).toEqual({ x: 400, y: 300, zoom: 1.5, rotation: 0 });
    const last = r.cameraKeys[4];
    expect(last.cam).toEqual({ x: 800, y: 400, zoom: 2.5, rotation: 0 });
    expect(last.easing).toBe('easeInOut');
  });

  it('defaults to a pure slow zoom on the current view', () => {
    const r = buildCameraPush(createDefaultScene(), { startAt: 0, duration: 2 });
    const last = r.cameraKeys[r.cameraKeys.length - 1];
    expect(last.cam.x).toBe(960);
    expect(last.cam.y).toBe(540);
    expect(last.cam.zoom).toBeCloseTo(1.6);
  });
});

describe('buildMotionPreset dispatch', () => {
  it('routes every kind without throwing', () => {
    const scene = twoUnitScene();
    scene.keyframes.u1 = [
      { time: 0, transform: { ...scene.objects.u1.transform } },
      { time: 2, transform: { ...scene.objects.u1.transform, x: 300 } },
    ];
    // march/charge MERGE into the existing [0, 2] track (preset wins at 0,
    // old key at 2 survives, travel end lands at 0 + 3).
    expect(
      buildMotionPreset(scene, 'march', { ids: ['u1'] }).keyframes.u1.map((k) => k.time)
    ).toEqual([0, 2, 3]);
    expect(
      buildMotionPreset(scene, 'charge', { ids: ['u1'] }).keyframes.u1.map((k) => k.time)
    ).toEqual([0, 1.6, 2]);
    expect(buildMotionPreset(scene, 'settle', { ids: ['u1'] }).keyframes.u1).toHaveLength(2);
    expect(
      buildMotionPreset(scene, 'camera-push', {}).cameraKeys.length
    ).toBeGreaterThan(0);
  });
});
