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
