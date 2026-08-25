import { describe, expect, it } from 'vitest';
import { getCameraAtTime, hasCameraTrack } from './cameraTrack';
import type { Scene } from '../scene/types';

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 's1',
    name: 'S1',
    worldSize: { w: 1920, h: 1080 },
    assets: {},
    objects: {},
    layers: [],
    keyframes: {},
    camera: { x: 960, y: 540, zoom: 1 },
    timeline: { duration: 6, fps: 30 },
    ...overrides,
  };
}

describe('getCameraAtTime', () => {
  it('returns a copy of the base camera when there is no track (byte-identical behaviour)', () => {
    const scene = makeScene();
    const cam = getCameraAtTime(scene, 2.5);
    expect(cam).toEqual({ x: 960, y: 540, zoom: 1 });
    expect(cam).not.toBe(scene.camera); // copy — callers may treat as value
    expect(cam.rotation).toBeUndefined();
  });

  it('returns the base camera for an empty track', () => {
    const scene = makeScene({ cameraTrack: [] });
    expect(getCameraAtTime(scene, 0)).toEqual({ x: 960, y: 540, zoom: 1 });
    expect(hasCameraTrack(scene)).toBe(false);
  });

  it('HOLDs before the first and after the last keyframe', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 2, cam: { x: 100, y: 200, zoom: 2 } },
        { time: 4, cam: { x: 300, y: 400, zoom: 4 } },
      ],
    });
    expect(getCameraAtTime(scene, 0)).toEqual({ x: 100, y: 200, zoom: 2 });
    expect(getCameraAtTime(scene, -5)).toEqual({ x: 100, y: 200, zoom: 2 });
    expect(getCameraAtTime(scene, 9)).toEqual({ x: 300, y: 400, zoom: 4 });
  });

  it('lerps LINEARLY between keyframes at exact midpoint', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 2, cam: { x: 100, y: 200, zoom: 2 } },
        { time: 4, cam: { x: 300, y: 400, zoom: 4 } },
      ],
    });
    expect(getCameraAtTime(scene, 3)).toEqual({
      x: 200,
      y: 300,
      zoom: 3,
    });
  });

  it('hits exact stored values AT keyframe times', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 1, cam: { x: 10, y: 20, zoom: 1.5 } },
        { time: 3, cam: { x: 30, y: 40, zoom: 2.5 } },
      ],
    });
    expect(getCameraAtTime(scene, 1)).toEqual({ x: 10, y: 20, zoom: 1.5 });
    expect(getCameraAtTime(scene, 3)).toEqual({ x: 30, y: 40, zoom: 2.5 });
  });

  it('sorts an unsorted track before evaluating', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 4, cam: { x: 300, y: 400, zoom: 4 } },
        { time: 2, cam: { x: 100, y: 200, zoom: 2 } },
      ],
    });
    expect(getCameraAtTime(scene, 3)).toEqual({ x: 200, y: 300, zoom: 3 });
  });

  it('falls back to the base camera rotation when keyframes carry none', () => {
    const scene = makeScene({
      camera: { x: 960, y: 540, zoom: 1, rotation: 0.25 },
      cameraTrack: [{ time: 1, cam: { x: 50, y: 60, zoom: 3 } }],
    });
    expect(getCameraAtTime(scene, 5)).toMatchObject({ rotation: 0.25 });
  });

  it('animates rotation LINEARLY when both keyframes carry it', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 0, cam: { x: 0, y: 0, zoom: 1, rotation: 0 } },
        { time: 4, cam: { x: 0, y: 0, zoom: 1, rotation: Math.PI } },
      ],
    });
    expect(getCameraAtTime(scene, 2).rotation).toBeCloseTo(Math.PI / 2);
    expect(getCameraAtTime(scene, 4).rotation).toBeCloseTo(Math.PI);
    expect(getCameraAtTime(scene, -1).rotation).toBeCloseTo(0); // HOLD before
  });

  it('keeps base rotation when only ONE keyframe carries rotation', () => {
    const scene = makeScene({
      camera: { x: 0, y: 0, zoom: 1, rotation: 0.5 },
      cameraTrack: [
        { time: 0, cam: { x: 0, y: 0, zoom: 1, rotation: 1 } },
        { time: 4, cam: { x: 10, y: 10, zoom: 2 } }, // no rotation
      ],
    });
    expect(getCameraAtTime(scene, 2).rotation).toBe(0.5);
  });

  it('is deterministic: same inputs produce identical outputs', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 1, cam: { x: 10, y: 10, zoom: 1 } },
        { time: 5, cam: { x: 90, y: 90, zoom: 5 } },
      ],
    });
    const a = getCameraAtTime(scene, 2.75);
    const b = getCameraAtTime(scene, 2.75);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('hasCameraTrack', () => {
  it('is false when absent and true with ≥1 keyframe', () => {
    expect(hasCameraTrack(makeScene())).toBe(false);
    expect(hasCameraTrack(makeScene({ cameraTrack: [] }))).toBe(false);
    expect(
      hasCameraTrack(
        makeScene({ cameraTrack: [{ time: 0, cam: { x: 1, y: 2, zoom: 1 } }] })
      )
    ).toBe(true);
  });
});

describe('camera easing (parity with object keyframes)', () => {
  const linear = makeScene({
    cameraTrack: [
      { time: 2, cam: { x: 100, y: 100, zoom: 1 } },
      { time: 4, cam: { x: 300, y: 300, zoom: 5 } },
    ],
  });

  it('absent easing stays byte-identical LINEAR (legacy scenes)', () => {
    expect(getCameraAtTime(linear, 3)).toEqual({ x: 200, y: 200, zoom: 3 });
    expect(getCameraAtTime(linear, 2.5)).toEqual({ x: 150, y: 150, zoom: 2 });
  });

  it('endpoints still clamp-hold regardless of easing', () => {
    const eased = makeScene({
      cameraTrack: [
        { time: 2, cam: { x: 100, y: 100, zoom: 1 }, easing: 'easeIn' },
        { time: 4, cam: { x: 300, y: 300, zoom: 5 }, easing: 'easeOut' },
      ],
    });
    expect(getCameraAtTime(eased, 1)).toEqual({ x: 100, y: 100, zoom: 1 });
    expect(getCameraAtTime(eased, 9)).toEqual({ x: 300, y: 300, zoom: 5 });
  });

  it('easeIn on the left key slows the segment start (t=0.5 → quarter distance)', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 2, cam: { x: 0, y: 0, zoom: 1 }, easing: 'easeIn' },
        { time: 4, cam: { x: 200, y: 200, zoom: 3 } },
      ],
    });
    // easeIn(0.5) = 0.25 → x = 200 * 0.25 = 50, zoom = 1 + 2*0.25 = 1.5
    expect(getCameraAtTime(scene, 3).x).toBeCloseTo(50);
    expect(getCameraAtTime(scene, 3).zoom).toBeCloseTo(1.5);
  });

  it('easeInOut midpoint lands at half distance; quarter-point lags', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 0, cam: { x: 0, y: 0, zoom: 1 }, easing: 'easeInOut' },
        { time: 10, cam: { x: 100, y: 100, zoom: 2 } },
      ],
    });
    expect(getCameraAtTime(scene, 5).x).toBeCloseTo(50);
    expect(getCameraAtTime(scene, 2.5).x).toBeCloseTo(12.5); // easeInOut(.25)=.125
    expect(getCameraAtTime(scene, 7.5).y).toBeCloseTo(87.5); // mirrored
  });

  it('hold freezes the LEFT view for the whole segment', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 2, cam: { x: 10, y: 20, zoom: 2 }, easing: 'hold' },
        { time: 4, cam: { x: 900, y: 900, zoom: 9 } },
      ],
    });
    expect(getCameraAtTime(scene, 3)).toEqual({ x: 10, y: 20, zoom: 2 });
    expect(getCameraAtTime(scene, 3.999).x).toBeCloseTo(10);
  });

  it('eased t drives ALL channels together (incl. rotation)', () => {
    const scene = makeScene({
      cameraTrack: [
        {
          time: 0,
          cam: { x: 0, y: 0, zoom: 1, rotation: 0 },
          easing: 'easeOut',
        },
        { time: 2, cam: { x: 100, y: 100, zoom: 3, rotation: 1 } },
      ],
    });
    // easeOut(0.5) = 0.75
    const mid = getCameraAtTime(scene, 1);
    expect(mid.x).toBeCloseTo(75);
    expect(mid.y).toBeCloseTo(75);
    expect(mid.zoom).toBeCloseTo(2.5);
    expect(mid.rotation).toBeCloseTo(0.75);
  });

  it('is monotonic in time for eased segments (no backtracking)', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 0, cam: { x: 0, y: 0, zoom: 1 }, easing: 'easeInOut' },
        { time: 6, cam: { x: 600, y: 0, zoom: 4 } },
      ],
    });
    let prev = -Infinity;
    for (let t = 0; t <= 6; t += 0.25) {
      const x = getCameraAtTime(scene, t).x;
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
  });
});
