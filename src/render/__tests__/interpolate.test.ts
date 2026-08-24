import { describe, it, expect } from 'vitest';
import {
  applyEasing,
  interpolateTransform,
  cubicBezierPoint,
  segmentControlPoints,
  segmentIsCurved,
} from '../interpolate';
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

describe('P0 basic easing (temporal)', () => {
  // Quadratic ease curves: endpoints pinned, midpoints diverge from linear.
  it('applyEasing pins endpoints and remaps the midpoint per curve', () => {
    for (const e of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      expect(applyEasing(e, 0)).toBe(0);
      expect(applyEasing(e, 1)).toBe(1);
    }
    expect(applyEasing('linear', 0.25)).toBe(0.25);
    expect(applyEasing('easeIn', 0.25)).toBeCloseTo(0.0625);
    expect(applyEasing('easeOut', 0.25)).toBeCloseTo(0.4375);
    expect(applyEasing('easeInOut', 0.25)).toBeCloseTo(0.125);
    // Monotonic across the whole range for every curve.
    for (const e of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      let prev = -Infinity;
      for (let i = 0; i <= 20; i++) {
        const v = applyEasing(e, i / 20);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  const span: Keyframe[] = [
    {
      time: 0,
      transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
      easing: 'easeIn',
    },
    { time: 10, transform: { x: 100, y: 40, rotation: 90, scale: 2, opacity: 0.5 } },
  ];

  it("the LEFT keyframe's easing governs its outgoing segment", () => {
    // easeIn at t=0.5 -> progress 0.25 on every channel.
    const r = interpolateTransform(span, 5, base);
    expect(r.x).toBeCloseTo(25);
    expect(r.y).toBeCloseTo(10);
    expect(r.rotation).toBeCloseTo(22.5);
    expect(r.scale).toBeCloseTo(1.25);
    expect(r.opacity).toBeCloseTo(0.875);
    // Endpoints stay exact.
    expect(interpolateTransform(span, 0, base)).toEqual(span[0].transform);
    expect(interpolateTransform(span, 10, base)).toEqual(span[1].transform);
  });

  it.each(['easeOut', 'easeInOut', 'hold'] as const)(
    "per-keyframe '%s' behaves like its opts equivalent",
    (e) => {
      const kfs = [{ ...span[0], easing: e }, span[1]];
      const expected = interpolateTransform(
        span.map((k, i) => (i === 0 ? { ...k, easing: undefined } : k)),
        5,
        base,
        { easing: e }
      );
      expect(interpolateTransform(kfs, 5, base)).toEqual(expected);
    }
  );

  it('an explicit opts.easing overrides the stored keyframe easing', () => {
    const linear = interpolateTransform(span, 5, base, { easing: 'linear' });
    expect(linear.x).toBeCloseTo(50); // NOT the eased 25
  });

  it('absent easing stays byte-identical linear (legacy scenes)', () => {
    const legacy: Keyframe[] = [
      { time: 0, transform: span[0].transform },
      { time: 10, transform: span[1].transform },
    ];
    const r = interpolateTransform(legacy, 2.5, base); // t=0.25
    expect(r.x).toBe(25);
    expect(r.y).toBe(10);
  });

  it('eases the bezier parameter of curved segments too', () => {
    const curved: Keyframe[] = [
      {
        time: 0,
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
        cpOut: { dx: 50, dy: 60 },
        easing: 'easeIn',
      },
      { time: 10, transform: { x: 100, y: 0, rotation: 0, scale: 1, opacity: 1 } },
    ];
    const eased = interpolateTransform(curved, 5, base);
    const straight = interpolateTransform(curved, 5, base, { easing: 'linear' });
    // Same curve, different parameter -> different point along it. The linear
    // case must equal the raw bezier evaluated at t=0.5.
    const { p0, p1, p2, p3 } = segmentControlPoints(curved[0], curved[1]);
    expect(straight.x).toBeCloseTo(cubicBezierPoint(p0, p1, p2, p3, 0.5).x);
    expect(eased.x).toBeLessThan(straight.x); // easeIn lags behind on the path
    // Endpoints unchanged.
    expect(interpolateTransform(curved, 0, base).x).toBe(0);
    expect(interpolateTransform(curved, 10, base).x).toBe(100);
  });
});

describe('P1 curved paths (bezier control points)', () => {
  // Byte-identical regression: keyframes WITHOUT cps must produce EXACT
  // linear-lerp numbers (toBe, not toBeCloseTo) — identical to pre-curve code.
  it('absent cps -> exact linear output (byte-identical regression)', () => {
    const kfs: Keyframe[] = [
      { time: 0, transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 } },
      { time: 10, transform: { x: 100, y: -40, rotation: 90, scale: 2, opacity: 0.5 } },
    ];
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const r = interpolateTransform(kfs, i, base);
      expect(r.x).toBe(100 * t); // lerp is exact at these dyadic values
      expect(r.y).toBe(-40 * t);
      expect(r.scale).toBe(1 + t);
      expect(r.opacity).toBe(1 - 0.5 * t);
    }
  });

  it('zero / single keyframe ignore cps entirely', () => {
    expect(interpolateTransform([], 5, { ...base })).toEqual(base);
    const single: Keyframe[] = [
      {
        time: 3,
        transform: { x: 7, y: 8, rotation: 12, scale: 1.5, opacity: 0.9 },
        cpOut: { dx: 50, dy: 50 },
      },
    ];
    expect(interpolateTransform(single, 99, base)).toEqual(single[0].transform);
    expect(interpolateTransform(single, 0, base)).toEqual(single[0].transform);
  });

  it('cubicBezierPoint hits endpoints and the symmetric midpoint formula', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 30, y: -90 };
    const p2 = { x: 70, y: -90 };
    const p3 = { x: 100, y: 0 };
    expect(cubicBezierPoint(p0, p1, p2, p3, 0)).toEqual(p0);
    expect(cubicBezierPoint(p0, p1, p2, p3, 1)).toEqual(p3);
    // B(0.5) = (p0 + 3*p1 + 3*p2 + p3) / 8
    const mid = cubicBezierPoint(p0, p1, p2, p3, 0.5);
    expect(mid.x).toBeCloseTo((0 + 3 * 30 + 3 * 70 + 100) / 8, 10);
    expect(mid.y).toBeCloseTo((0 + 3 * -90 + 3 * -90 + 0) / 8, 10);
  });

  it('segmentControlPoints resolves offsets and collinear defaults', () => {
    const a: Keyframe = {
      time: 0,
      transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
      cpOut: { dx: 10, dy: -20 },
    };
    const b: Keyframe = {
      time: 10,
      transform: { x: 90, y: 60, rotation: 0, scale: 1, opacity: 1 },
    };
    const seg = segmentControlPoints(a, b);
    expect(seg.p0).toEqual({ x: 0, y: 0 });
    expect(seg.p3).toEqual({ x: 90, y: 60 });
    expect(seg.p1).toEqual({ x: 10, y: -20 }); // offset applied
    // Missing cpIn defaults to the 2/3 point of the chord.
    expect(seg.p2.x).toBeCloseTo(60);
    expect(seg.p2.y).toBeCloseTo(40);

    const plain = segmentControlPoints(
      { time: 0, transform: b.transform }, // p0 = (90, 60)
      { time: 10, transform: a.transform } // p3 = (0, 0)
    );
    // Defaults are the collinear 1/3 and 2/3 points of the chord.
    expect(plain.p1.x).toBeCloseTo(90 - 90 / 3); // lerp(90, 0, 1/3) = 60
    expect(plain.p1.y).toBeCloseTo(40);
    expect(plain.p2.x).toBeCloseTo(30); // lerp(90, 0, 2/3)
    expect(plain.p2.y).toBeCloseTo(20);
  });

  it('segmentIsCurved fires when EITHER side carries a cp', () => {
    const kfA: Keyframe = { time: 0, transform: base };
    const kfB: Keyframe = { time: 10, transform: base };
    expect(segmentIsCurved(kfA, kfB)).toBe(false);
    expect(segmentIsCurved({ ...kfA, cpOut: { dx: 1, dy: 2 } }, kfB)).toBe(true);
    expect(segmentIsCurved(kfA, { ...kfB, cpIn: { dx: 1, dy: 2 } })).toBe(true);
  });

  it('curved segment follows the bezier in x/y; other channels stay linear', () => {
    const kfs: Keyframe[] = [
      {
        time: 0,
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
        cpOut: { dx: 50, dy: -150 },
      },
      { time: 10, transform: { x: 100, y: 0, rotation: 90, scale: 2, opacity: 0 } },
    ];
    const r = interpolateTransform(kfs, 5, base);
    // B(0.5) = (p0 + 3*p1 + 3*p2 + p3)/8 with p1=(50,-150),
    // p2=default (66.666.., 0), p3=(100,0):
    //   x = (150 + 200 + 100)/8 = 56.25 ; y = -450/8 = -56.25
    expect(r.y).toBeCloseTo(-56.25, 6);
    expect(r.x).toBeCloseTo(56.25, 6);
    // Rotation/scale/opacity are UNCHANGED linear lerps.
    expect(r.rotation).toBeCloseTo(45);
    expect(r.scale).toBeCloseTo(1.5);
    expect(r.opacity).toBeCloseTo(0.5);
  });

  it('single cpIn on the right keyframe also bends the path', () => {
    const kfs: Keyframe[] = [
      { time: 0, transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 } },
      {
        time: 10,
        transform: { x: 100, y: 0, rotation: 0, scale: 1, opacity: 1 },
        cpIn: { dx: -20, dy: 80 }, // world (80, 80)
      },
    ];
    const r = interpolateTransform(kfs, 5, base);
    // p1 default = (33.33.., 0), p2 = (80, 80): B(0.5).y = (3*0 + 3*80)/8 = 30
    expect(r.y).toBeCloseTo(30, 6);
  });

  it('shortest-path rotation is untouched by control points', () => {
    const kfs: Keyframe[] = [
      {
        time: 0,
        transform: { x: 0, y: 0, rotation: 350, scale: 1, opacity: 1 },
        cpOut: { dx: 40, dy: -40 },
      },
      { time: 10, transform: { x: 100, y: 100, rotation: 10, scale: 1, opacity: 1 } },
    ];
    expect(interpolateTransform(kfs, 5, base).rotation).toBeCloseTo(0, 5);
  });

  it('easing="hold" ignores control points', () => {
    const kfs: Keyframe[] = [
      {
        time: 0,
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
        cpOut: { dx: 500, dy: 500 },
      },
      { time: 10, transform: { x: 100, y: 0, rotation: 0, scale: 1, opacity: 1 } },
    ];
    expect(interpolateTransform(kfs, 5, base, { easing: 'hold' }).x).toBe(0);
  });

  it('is deterministic: repeated calls return deep-equal transforms', () => {
    const kfs: Keyframe[] = [
      {
        time: 0,
        transform: { x: 0, y: 0, rotation: 10, scale: 1, opacity: 1 },
        cpOut: { dx: 33, dy: -77 },
      },
      {
        time: 10,
        transform: { x: 120, y: 40, rotation: -30, scale: 1.7, opacity: 0.2 },
        cpIn: { dx: -25, dy: 66 },
      },
    ];
    for (const time of [2.5, 5, 7.25]) {
      expect(interpolateTransform(kfs, time, base)).toEqual(
        interpolateTransform(kfs, time, base)
      );
    }
  });

  it('multi-keyframe scenes use each segment\u2019s own cps', () => {
    const kfs: Keyframe[] = [
      {
        time: 0,
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
        cpOut: { dx: 0, dy: -100 }, // bends ONLY segment 0->5 upward
      },
      { time: 5, transform: { x: 50, y: 0, rotation: 0, scale: 1, opacity: 1 } },
      { time: 10, transform: { x: 100, y: 0, rotation: 0, scale: 1, opacity: 1 } },
    ];
    // Segment 0->5 is curved; segment 5->10 is straight.
    expect(interpolateTransform(kfs, 2.5, base).y).toBeLessThan(-10);
    expect(interpolateTransform(kfs, 7.5, base).y).toBe(0);
  });
});
