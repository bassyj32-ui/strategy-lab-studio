import { describe, expect, it } from 'vitest';
import type { Keyframe } from '../scene/types';
import { pathLength, sampleAtPath, tangentAtDistance } from './pathGeometry';

function kf(time: number, x: number, y: number): Keyframe {
  return { time, transform: { x, y, rotation: 0, scale: 1, opacity: 1 } };
}

function kfCurve(
  time: number,
  x: number,
  y: number,
  cpOutDx: number,
  cpOutDy: number,
  cpInDx: number,
  cpInDy: number
): Keyframe {
  return {
    time,
    transform: { x, y, rotation: 0, scale: 1, opacity: 1 },
    cpOut: { dx: cpOutDx, dy: cpOutDy },
    cpIn: { dx: cpInDx, dy: cpInDy },
  };
}

describe('pathLength', () => {
  it('returns 0 for empty keyframes', () => {
    expect(pathLength([])).toBe(0);
  });

  it('returns 0 for a single keyframe', () => {
    expect(pathLength([kf(0, 100, 200)])).toBe(0);
  });

  it('computes straight-line length', () => {
    const kfs = [kf(0, 0, 0), kf(1, 3, 4)];
    expect(pathLength(kfs)).toBeCloseTo(5);
  });

  it('computes multi-segment length', () => {
    const kfs = [kf(0, 0, 0), kf(1, 10, 0), kf(2, 10, 10)];
    expect(pathLength(kfs)).toBeCloseTo(20);
  });

  it('handles unsorted keyframes', () => {
    const kfs = [kf(2, 10, 10), kf(0, 0, 0), kf(1, 10, 0)];
    expect(pathLength(kfs)).toBeCloseTo(20);
  });
});

describe('sampleAtPath', () => {
  it('returns null for empty keyframes', () => {
    expect(sampleAtPath([], 0)).toBeNull();
  });

  it('returns first point for distance 0', () => {
    const kfs = [kf(0, 0, 0), kf(1, 10, 0)];
    const pt = sampleAtPath(kfs, 0)!;
    expect(pt.x).toBeCloseTo(0);
    expect(pt.y).toBeCloseTo(0);
  });

  it('samples midpoint of straight line', () => {
    const kfs = [kf(0, 0, 0), kf(1, 10, 0)];
    const pt = sampleAtPath(kfs, 5)!;
    expect(pt.x).toBeCloseTo(5);
    expect(pt.y).toBeCloseTo(0);
  });

  it('clamps to end when distance exceeds total length', () => {
    const kfs = [kf(0, 0, 0), kf(1, 10, 0)];
    const pt = sampleAtPath(kfs, 100)!;
    expect(pt.x).toBeCloseTo(10);
    expect(pt.y).toBeCloseTo(0);
  });

  it('samples multi-segment path correctly', () => {
    const kfs = [kf(0, 0, 0), kf(1, 10, 0), kf(2, 10, 10)];
    const pt = sampleAtPath(kfs, 15)!;
    expect(pt.x).toBeCloseTo(10);
    expect(pt.y).toBeCloseTo(5);
  });

  it('samples along a curved path', () => {
    const kfs = [
      kfCurve(0, 0, 0, 50, 0, -50, 0),
      kfCurve(1, 100, 0, 50, 0, -50, 0),
    ];
    const pt = sampleAtPath(kfs, 50)!;
    expect(pt.x).toBeGreaterThan(0);
    expect(pt.x).toBeLessThan(100);
    expect(pt.y).toBeCloseTo(0);
  });
});

describe('tangentAtDistance', () => {
  it('returns null for empty keyframes', () => {
    expect(tangentAtDistance([], 0)).toBeNull();
  });

  it('returns unit tangent for straight line at start', () => {
    const kfs = [kf(0, 0, 0), kf(1, 10, 0)];
    const tan = tangentAtDistance(kfs, 0)!;
    expect(tan.x).toBeCloseTo(1);
    expect(tan.y).toBeCloseTo(0);
  });

  it('returns unit tangent for straight line at end', () => {
    const kfs = [kf(0, 0, 0), kf(1, 10, 0)];
    const tan = tangentAtDistance(kfs, 10)!;
    expect(tan.x).toBeCloseTo(1);
    expect(tan.y).toBeCloseTo(0);
  });

  it('returns downward tangent for vertical line', () => {
    const kfs = [kf(0, 0, 0), kf(1, 0, 10)];
    const tan = tangentAtDistance(kfs, 5)!;
    expect(tan.x).toBeCloseTo(0);
    expect(tan.y).toBeCloseTo(1);
  });

  it('returns normalized tangent (unit length)', () => {
    const kfs = [kf(0, 0, 0), kf(1, 3, 4)];
    const tan = tangentAtDistance(kfs, 2.5)!;
    const len = Math.sqrt(tan.x * tan.x + tan.y * tan.y);
    expect(len).toBeCloseTo(1);
  });

  it('handles unsorted keyframes', () => {
    const kfs = [kf(2, 10, 0), kf(0, 0, 0)];
    const tan = tangentAtDistance(kfs, 5)!;
    expect(tan.x).toBeCloseTo(1);
    expect(tan.y).toBeCloseTo(0);
  });
});
