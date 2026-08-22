import { describe, it, expect } from 'vitest';
import { interpolateTransform } from '../interpolate';
import type { Keyframe, Transform } from '../../scene/types';

// Guards for the CANONICAL interpolation engine (src/render/interpolate.ts).
// The timeline suite covers the same behavior through the delegation shim;
// these tests pin the canonical module directly so a future second engine or
// a shim that stops delegating cannot silently diverge again.
const base: Transform = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };

describe('render/interpolateTransform (canonical engine)', () => {
  const span: Keyframe[] = [
    { time: 0, transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 } },
    { time: 10, transform: { x: 100, y: 0, rotation: 90, scale: 2, opacity: 0 } },
  ];

  it('easing="hold" clamps to the segment start value until segment end', () => {
    expect(interpolateTransform(span, 5, base, { easing: 'hold' })).toEqual(
      span[0].transform
    );
    expect(interpolateTransform(span, 9.999, base, { easing: 'hold' }).x).toBe(0);
    // Segment end returns the end keyframe exactly.
    expect(interpolateTransform(span, 10, base, { easing: 'hold' })).toEqual(
      span[1].transform
    );
  });

  it('defaults to linear and uses shortest-path rotation', () => {
    const r = interpolateTransform(span, 5, base);
    expect(r.x).toBeCloseTo(50);
    expect(r.rotation).toBeCloseTo(45);

    const wrap: Keyframe[] = [
      { time: 0, transform: { ...base, rotation: 350 } },
      { time: 10, transform: { ...base, rotation: 10 } },
    ];
    // Shortest path 350 -> 360/0 -> 10, NOT down through 180.
    expect(interpolateTransform(wrap, 5, base).rotation).toBeCloseTo(0, 5);
  });
});
