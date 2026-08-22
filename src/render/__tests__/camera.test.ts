import { describe, it, expect } from 'vitest';
import { applyCamera } from '../camera';
import type { CameraState, WorldSize, Transform } from '../../scene/types';

const worldSize: WorldSize = { w: 1920, h: 1080 };
const video = { w: 1920, h: 1080 };
const at = (x: number, y: number): Transform => ({
  x,
  y,
  rotation: 0,
  scale: 1,
  opacity: 1,
});

describe('applyCamera', () => {
  it('identity: camera at origin, object at origin -> video center', () => {
    const cam: CameraState = { x: 0, y: 0, zoom: 1 };
    const s = applyCamera(at(0, 0), cam, worldSize, video);
    expect(s.x).toBe(960);
    expect(s.y).toBe(540);
  });

  it('offset + zoom math', () => {
    const cam: CameraState = { x: 0, y: 0, zoom: 2 };
    const s = applyCamera(at(100, 0), cam, worldSize, video);
    expect(s.x).toBe(960 + 200);
    expect(s.y).toBe(540);
  });

  it('camera centered on world center centers that point on video', () => {
    const cam: CameraState = { x: 960, y: 540, zoom: 1 };
    const s = applyCamera(at(960, 540), cam, worldSize, video);
    expect(s.x).toBe(960);
    expect(s.y).toBe(540);
  });

  it('adds camera rotation onto the object rotation', () => {
    const cam: CameraState = { x: 0, y: 0, zoom: 1, rotation: 45 };
    const s = applyCamera({ ...at(0, 0), rotation: 10 }, cam, worldSize, video);
    expect(s.rotation).toBe(55);
  });

  it('multiplying scale by zoom', () => {
    const cam: CameraState = { x: 0, y: 0, zoom: 3 };
    const s = applyCamera({ ...at(0, 0), scale: 2 }, cam, worldSize, video);
    expect(s.scale).toBe(6);
  });
});
