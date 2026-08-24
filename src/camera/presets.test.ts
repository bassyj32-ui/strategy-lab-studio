import { describe, it, expect } from 'vitest';
import { buildCameraPreset, CAMERA_PRESETS } from './presets';
import { createDefaultScene } from '../scene/factory';

const scene = createDefaultScene('s'); // world 1920×1080, duration 10

describe('camera presets (PRD §27)', () => {
  it('exposes the five §27 presets', () => {
    expect(CAMERA_PRESETS.map((p) => p.kind)).toEqual([
      'overview',
      'tactical',
      'flank-follow',
      'commander-focus',
      'decisive',
    ]);
  });

  it('overview zooms to fit the battlefield at its centre', () => {
    const [k] = buildCameraPreset('overview', scene);
    expect(k.time).toBe(0);
    expect(k.cam.x).toBe(960);
    expect(k.cam.y).toBe(540);
    // 1920/1920 = 1, 1080/1080 = 1 → fit zoom is exactly 1.
    expect(k.cam.zoom).toBeCloseTo(1);
  });

  it('tactical zooms in on the centre at 1.8×', () => {
    const [k] = buildCameraPreset('tactical', scene);
    expect(k.cam).toEqual({ x: 960, y: 540, zoom: 1.8 });
  });

  it('flank-follow pans left → right across the line of battle', () => {
    const [a, b] = buildCameraPreset('flank-follow', scene);
    expect([a.time, b.time]).toEqual([0, 10]);
    expect(a.cam.x).toBe(1920 * 0.3);
    expect(b.cam.x).toBe(1920 * 0.7);
    expect(b.cam.x).toBeGreaterThan(a.cam.x);
    expect(a.cam.y).toBe(540);
    expect(a.cam.zoom).toBe(1.5);
    expect(b.cam.zoom).toBe(1.5);
  });

  it('commander-focus centres on the given focus point (or world centre)', () => {
    const [focused] = buildCameraPreset('commander-focus', scene, {
      x: 100,
      y: 200,
    });
    expect(focused.cam).toEqual({ x: 100, y: 200, zoom: 2 });
    const [fallback] = buildCameraPreset('commander-focus', scene);
    expect(fallback.cam).toEqual({ x: 960, y: 540, zoom: 2 });
  });

  it('decisive pushes in slowly toward centre over the timeline', () => {
    const [a, b] = buildCameraPreset('decisive', scene);
    expect([a.time, b.time]).toEqual([0, 10]);
    expect(a.cam.zoom).toBe(1);
    expect(b.cam.zoom).toBe(1.6);
    expect(a.cam.x).toBe(b.cam.x);
    expect(a.cam.y).toBe(b.cam.y);
  });
});
