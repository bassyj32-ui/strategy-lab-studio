import { describe, expect, it, vi } from 'vitest';

// react-konva/konva need a native canvas package in node — stub the render
// primitives so the pure sampling logic can be tested directly.
vi.mock('react-konva', () => ({ Line: () => null, Circle: () => null }));

import { sampleCameraPath } from './CameraPathOverlay';
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

describe('sampleCameraPath', () => {
  it('returns [] without a track', () => {
    expect(sampleCameraPath(makeScene())).toEqual([]);
    expect(sampleCameraPath(makeScene({ cameraTrack: [] }))).toEqual([]);
  });

  it('samples endpoints exactly and interpolates linearly between keys', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 0, cam: { x: 0, y: 0, zoom: 1 } },
        { time: 4, cam: { x: 400, y: 200, zoom: 2 } },
      ],
    });
    const pts = sampleCameraPath(scene, 8);
    expect(pts).toHaveLength(9); // inclusive endpoints
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 400, y: 200 });
    expect(pts[4]).toEqual({ x: 200, y: 100 }); // midpoint
  });

  it('respects per-key easing while sampling', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 0, cam: { x: 0, y: 0, zoom: 1 }, easing: 'easeIn' },
        { time: 10, cam: { x: 100, y: 0, zoom: 1 } },
      ],
    });
    const pts = sampleCameraPath(scene, 4);
    // easeIn(0.5) = 0.25 → halfway sample sits at x=25
    expect(pts[2].x).toBeCloseTo(25);
  });

  it('is monotonic along x for a left-to-right track regardless of easing', () => {
    const scene = makeScene({
      cameraTrack: [
        { time: 0, cam: { x: 0, y: 0, zoom: 1 }, easing: 'easeInOut' },
        { time: 6, cam: { x: 600, y: 0, zoom: 3 } },
      ],
    });
    const pts = sampleCameraPath(scene, 24);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x).toBeGreaterThanOrEqual(pts[i - 1].x);
    }
  });
});
