import { describe, it, expect } from 'vitest';
import { createDefaultScene, DEFAULT_TIMELINE, DEFAULT_WORLD } from './factory';

describe('createDefaultScene', () => {
  it('produces a deterministic default scene', () => {
    const a = createDefaultScene('s1');
    const b = createDefaultScene('s1');
    expect(a).toEqual(b);
  });

  it('uses the default world size and timeline', () => {
    const scene = createDefaultScene();
    expect(scene.worldSize).toEqual(DEFAULT_WORLD);
    expect(scene.timeline).toEqual(DEFAULT_TIMELINE);
    expect(scene.objects).toEqual({});
    expect(scene.assets).toEqual({});
    expect(scene.layers).toHaveLength(1);
    expect(scene.camera).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
