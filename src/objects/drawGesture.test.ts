import { describe, expect, it } from 'vitest';
import { arrowFromDrag, MIN_ARROW_DRAW_LENGTH } from './drawGesture';

describe('arrowFromDrag', () => {
  it('returns tail-anchored placement with 0deg for a straight +X drag', () => {
    const r = arrowFromDrag({ x: 100, y: 200 }, { x: 220, y: 200 });
    expect(r).not.toBeNull();
    expect(r!.x).toBe(100);
    expect(r!.y).toBe(200);
    expect(r!.rotation).toBeCloseTo(0);
    expect(r!.length).toBeCloseTo(120);
  });

  it('computes clockwise-positive degrees for a +Y (downward) drag', () => {
    const r = arrowFromDrag({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(r!.rotation).toBeCloseTo(90);
  });

  it('computes -90deg for an upward drag', () => {
    const r = arrowFromDrag({ x: 50, y: 50 }, { x: 50, y: -50 });
    expect(r!.rotation).toBeCloseTo(-90);
  });

  it('diagonal drag yields the matching angle and hypotenuse length', () => {
    const r = arrowFromDrag({ x: 0, y: 0 }, { x: 30, y: 40 });
    expect(r!.rotation).toBeCloseTo((Math.atan2(40, 30) * 180) / Math.PI);
    expect(r!.length).toBeCloseTo(50);
  });

  it('rejects drags shorter than MIN_ARROW_DRAW_LENGTH', () => {
    expect(
      arrowFromDrag({ x: 0, y: 0 }, { x: MIN_ARROW_DRAW_LENGTH - 1, y: 0 })
    ).toBeNull();
    // A pure click (zero-length) is also rejected.
    expect(arrowFromDrag({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });

  it('accepts a drag exactly at the minimum length', () => {
    const r = arrowFromDrag({ x: 0, y: 0 }, { x: MIN_ARROW_DRAW_LENGTH, y: 0 });
    expect(r).not.toBeNull();
    expect(r!.length).toBe(MIN_ARROW_DRAW_LENGTH);
  });
});
