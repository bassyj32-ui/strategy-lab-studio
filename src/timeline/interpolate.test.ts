import { describe, it, expect } from 'vitest';
import { interpolateTransform } from './interpolate';
import type { Keyframe, Transform } from '../scene/types';

const base: Transform = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };

describe('interpolateTransform', () => {
  it('returns base when there are no keyframes', () => {
    expect(interpolateTransform([], 5, base)).toEqual(base);
  });

  it('holds before the first keyframe', () => {
    const kfs: Keyframe[] = [
      { time: 2, transform: { x: 10, y: 0, rotation: 0, scale: 1, opacity: 1 } },
      { time: 4, transform: { x: 20, y: 0, rotation: 90, scale: 1, opacity: 1 } },
    ];
    expect(interpolateTransform(kfs, 0, base)).toEqual(kfs[0].transform);
  });

  it('holds after the last keyframe', () => {
    const kfs: Keyframe[] = [
      { time: 2, transform: { x: 10, y: 0, rotation: 0, scale: 1, opacity: 1 } },
      { time: 4, transform: { x: 20, y: 0, rotation: 90, scale: 1, opacity: 1 } },
    ];
    expect(interpolateTransform(kfs, 10, base)).toEqual(kfs[1].transform);
  });

  it('linearly interpolates at the midpoint', () => {
    const kfs: Keyframe[] = [
      { time: 0, transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 0 } },
      { time: 10, transform: { x: 100, y: 50, rotation: 0, scale: 2, opacity: 1 } },
    ];
    const r = interpolateTransform(kfs, 5, base);
    expect(r.x).toBeCloseTo(50);
    expect(r.y).toBeCloseTo(25);
    expect(r.scale).toBeCloseTo(1.5);
    expect(r.opacity).toBeCloseTo(0.5);
  });

  it('returns a.transform when a.time === b.time', () => {
    const kfs: Keyframe[] = [
      { time: 2, transform: { x: 10, y: 0, rotation: 0, scale: 1, opacity: 1 } },
      { time: 2, transform: { x: 99, y: 0, rotation: 0, scale: 1, opacity: 1 } },
    ];
    expect(interpolateTransform(kfs, 2, base)).toEqual(kfs[0].transform);
  });

  it('easing="hold" steps (returns left keyframe)', () => {
    const kfs: Keyframe[] = [
      { time: 0, transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 } },
      { time: 10, transform: { x: 100, y: 0, rotation: 0, scale: 1, opacity: 1 } },
    ];
    const r = interpolateTransform(kfs, 5, base, { easing: 'hold' });
    expect(r.x).toBe(0);
  });

  it('uses shortest-path rotation (350 -> 10 yields ~0 at mid)', () => {
    const kfs: Keyframe[] = [
      { time: 0, transform: { x: 0, y: 0, rotation: 350, scale: 1, opacity: 1 } },
      { time: 10, transform: { x: 0, y: 0, rotation: 10, scale: 1, opacity: 1 } },
    ];
    const r = interpolateTransform(kfs, 5, base);
    expect(r.rotation).toBeCloseTo(0, 5);
  });

  it('keeps rotation endpoints exact through the lerp branch', () => {
    const kfs: Keyframe[] = [
      { time: 0, transform: { ...base, rotation: 350 } },
      { time: 10, transform: { ...base, rotation: 10 } },
    ];
    // 350 + 20*0.25 = 355 (shortest path, NOT 265); 355 normalizes to -5.
    expect(interpolateTransform(kfs, 2.5, base).rotation).toBeCloseTo(-5, 5);
    // 350 + 20*0.9 = 368 -> normalized to 8.
    expect(interpolateTransform(kfs, 9, base).rotation).toBeCloseTo(8, 5);
    // Endpoint returns the exact stored keyframe value, never 370.
    expect(interpolateTransform(kfs, 10, base).rotation).toBe(10);
  });

  it('normalizes INTERPOLATED rotation to [-180, 180] across the span', () => {
    const kfs: Keyframe[] = [
      { time: 0, transform: { ...base, rotation: 350 } },
      { time: 10, transform: { ...base, rotation: 10 } },
    ];
    // Sample strictly inside the span: boundary holds intentionally return the
    // exact stored keyframe value (e.g. 350 stays 350 — data identity); only
    // interpolated results are normalized.
    for (let t = 0.5; t < 10; t += 0.5) {
      const rot = interpolateTransform(kfs, t, base).rotation;
      expect(rot).toBeGreaterThanOrEqual(-180);
      expect(rot).toBeLessThanOrEqual(180);
    }
  });
});
