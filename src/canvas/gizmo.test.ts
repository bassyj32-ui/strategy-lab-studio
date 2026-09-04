import { describe, it, expect } from 'vitest';
import {
  axisLockDelta,
  clampScale,
  continuousDeg,
  cornerOffset,
  rotatedOffset,
  cornerWorld,
  edgeWorld,
  nudgeStep,
  snapPos,
  stalkWorld,
  topCenterWorld,
  rotationFromPointer,
  normalizeDeg,
  snapDeg,
  scaleFromDrag,
  scrubValue,
  localDeltaForWorldDelta,
} from './gizmo';

const BOX = { minX: -20, minY: -10, maxX: 20, maxY: 10 };

describe('gizmo pure math', () => {
  it('clampScale enforces the min/max band', () => {
    expect(clampScale(0.01)).toBe(0.05);
    expect(clampScale(50)).toBe(20);
    expect(clampScale(2)).toBe(2);
  });

  it('cornerOffset picks box extremes', () => {
    expect(cornerOffset(BOX, 'min', 'max')).toEqual({ x: -20, y: 10 });
    expect(cornerOffset(BOX, 'max', 'min')).toEqual({ x: 20, y: -10 });
  });

  it('rotatedOffset rotates CW in screen coords (y down)', () => {
    // +90° turns "up" (-y) into "right" (+x).
    expect(rotatedOffset(0, -10, 90).x).toBeCloseTo(10);
    expect(rotatedOffset(0, -10, 90).y).toBeCloseTo(0);
    // 180° flips both axes.
    const p = rotatedOffset(10, 0, 180);
    expect(p.x).toBeCloseTo(-10);
    expect(p.y).toBeCloseTo(0);
  });

  it('cornerWorld folds anchor + rotation + scale', () => {
    // Anchor at origin, unrotated, scale 2 → top-right corner at (40,-20).
    const p = cornerWorld({ x: 0, y: 0 }, BOX, 0, 2, 'max', 'min');
    expect(p.x).toBeCloseTo(40);
    expect(p.y).toBeCloseTo(-20);
    // Same corner under 90° CW rotation lands at (20,40).
    const q = cornerWorld({ x: 0, y: 0 }, BOX, 90, 2, 'max', 'min');
    expect(q.x).toBeCloseTo(20);
    expect(q.y).toBeCloseTo(40);
  });

  it('stalkWorld sits above the top-center, rotating with the object', () => {
    const stalkLen = 24;
    const p = stalkWorld({ x: 100, y: 100 }, BOX, 0, 1, stalkLen);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(100 - (10 + stalkLen));
    const q = stalkWorld({ x: 100, y: 100 }, BOX, 90, 1, stalkLen);
    expect(q.x).toBeCloseTo(100 + (10 + stalkLen));
    expect(q.y).toBeCloseTo(100);
  });

  it('rotationFromPointer: up=0°, right=90°, down=±180°, left=-90°', () => {
    const a = { x: 0, y: 0 };
    expect(rotationFromPointer(a, { x: 0, y: -5 })).toBeCloseTo(0);
    expect(rotationFromPointer(a, { x: 5, y: 0 })).toBeCloseTo(90);
    expect(Math.abs(rotationFromPointer(a, { x: 0, y: 5 }))).toBeCloseTo(180);
    expect(rotationFromPointer(a, { x: -5, y: 0 })).toBeCloseTo(-90);
    expect(rotationFromPointer(a, a)).toBe(0); // degenerate
  });

  it('normalizeDeg wraps into [-180, 180]', () => {
    expect(normalizeDeg(270)).toBe(-90);
    expect(normalizeDeg(-190)).toBe(170);
    expect(normalizeDeg(45)).toBe(45);
  });

  it('snapDeg snaps to nearest multiple', () => {
    expect(snapDeg(17)).toBe(15);
    expect(snapDeg(22, 15)).toBe(15);
    expect(snapDeg(83, 45)).toBe(90);
    expect(snapDeg(10, 0)).toBe(10); // no snap
  });

  it('scaleFromDrag is multiplicative and clamped', () => {
    expect(scaleFromDrag(1, 50, 100)).toBe(2);
    expect(scaleFromDrag(2, 100, 50)).toBe(1);
    expect(scaleFromDrag(1, 0.0001, 999)).toBe(1); // degenerate start
    expect(scaleFromDrag(19, 10, 100)).toBe(20); // clamped max
    expect(scaleFromDrag(0.06, 100, 1)).toBe(0.05); // clamped min
  });

  it('scrubValue applies sensitivity and the fine factor', () => {
    expect(scrubValue(100, 25, 1, false)).toBe(125);
    expect(scrubValue(100, 25, 1, true)).toBe(102.5);
    expect(scrubValue(1, 30, 0.01, false)).toBeCloseTo(1.3);
  });

  it('topCenterWorld is the stalk base (NOT the NW corner)', () => {
    // Unrotated: top-center sits at (cx, minY); NW corner must differ.
    const top = topCenterWorld({ x: 0, y: 0 }, BOX, 0, 1);
    expect(top).toEqual({ x: 0, y: -10 });
    const nw = cornerWorld({ x: 0, y: 0 }, BOX, 0, 1, 'min', 'min');
    expect(nw).toEqual({ x: -20, y: -10 });
    expect(top.x).not.toBe(nw.x);
    // Rotated 90° CW: "up" becomes "right".
    const q = topCenterWorld({ x: 0, y: 0 }, BOX, 90, 1);
    expect(q.x).toBeCloseTo(10);
    expect(q.y).toBeCloseTo(0);
  });

  it('edgeWorld hits edge midpoints', () => {
    expect(edgeWorld({ x: 0, y: 0 }, BOX, 0, 1, 'n')).toEqual({ x: 0, y: -10 });
    expect(edgeWorld({ x: 0, y: 0 }, BOX, 0, 1, 's')).toEqual({ x: 0, y: 10 });
    expect(edgeWorld({ x: 0, y: 0 }, BOX, 0, 1, 'e')).toEqual({ x: 20, y: 0 });
    expect(edgeWorld({ x: 0, y: 0 }, BOX, 0, 1, 'w')).toEqual({ x: -20, y: 0 });
  });

  it('axisLockDelta keeps the dominant axis (Shift move)', () => {
    expect(axisLockDelta(30, 5)).toEqual({ x: 30, y: 0 });
    expect(axisLockDelta(5, 30)).toEqual({ x: 0, y: 30 });
  });

  it('snapPos + nudgeStep (precision controls)', () => {
    expect(snapPos(10.6, 1)).toBe(11);
    expect(snapPos(10.6, 0)).toBe(10.6);
    expect(nudgeStep(false)).toBe(1);
    expect(nudgeStep(true)).toBe(10);
  });

  it('continuousDeg takes the short path across ±180 (no jumps)', () => {
    // Was at +179°, pointer says -179° → lands on -179° via a +2° step,
    // not a -358° swing.
    const d = continuousDeg(179, -179);
    expect(d).toBeCloseTo(-179);
    expect(normalizeDeg(d - 179)).toBeCloseTo(2);
    expect(continuousDeg(10, 20)).toBeCloseTo(20);
  });

  it('localDeltaForWorldDelta maps through worldToLocal', () => {
    // Identity frame: delta passes straight through.
    const d = localDeltaForWorldDelta((x, y) => ({ x, y }), 10, -4);
    expect(d).toEqual({ x: 10, y: -4 });
    // Rotated parent frame: world +x becomes local -y under +90° parent rot.
    const cos = Math.cos(Math.PI / 2);
    const sin = Math.sin(Math.PI / 2);
    const toLocal = (wx: number, wy: number) => ({
      x: wx * cos + wy * sin,
      y: -wx * sin + wy * cos,
    });
    const dl = localDeltaForWorldDelta(toLocal, 8, 0);
    expect(dl.x).toBeCloseTo(0);
    expect(dl.y).toBeCloseTo(-8);
  });
});
