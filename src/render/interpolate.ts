import type {
  ControlPoint,
  Easing,
  Keyframe,
  Transform,
  Vec2,
} from '../scene/types';

/**
 * CANONICAL deterministic transform interpolation (MVP-1 + owner-approved
 * P1 curve pull-forward + P0 basic easing).
 *
 * This is the ONE shared implementation consumed by BOTH the editor timeline
 * and the Remotion render path (architecture Law 1 / PRD §65, §99). There must
 * never be a second interpolation engine.
 *
 * - Zero keyframes -> returns `base` (the object's own transform).
 * - Before first / after last -> HOLD (clamp to nearest keyframe).
 * - Between two keyframes -> LINEAR by default. TEMPORAL EASING (PRD §112 P0):
 *   `opts.easing` overrides; otherwise the LEFT keyframe's `easing` field
 *   governs its outgoing segment. 'hold' steps (clamp to segment start until
 *   segment end); 'easeIn'/'easeOut'/'easeInOut' remap the segment progress t
 *   through a quadratic ease BEFORE any channel math.
 * - CURVED MOVEMENT (P1): if either keyframe of a segment carries a control
 *   point (`cpOut` on the left, `cpIn` on the right), x/y follow the cubic
 *   bezier P0 -> A+cpOut -> B+cpIn -> P3 at the SAME (eased) parameter t. A
 *   missing handle falls back to the collinear 1/3 / 2/3 point so a single
 *   dragged handle still yields a smooth curve. Rotation/scale/opacity keep
 *   their eased lerp — control points shape the PATH only. With no cps and
 *   no easing anywhere the output is byte-identical to the original linear
 *   engine.
 * - `rotation` uses shortest-path angular lerp (normalized to [-180, 180]);
 *   clamped boundary results return the exact stored keyframe value.
 * - Pure + deterministic: same inputs -> same outputs, no clocks, no RNG.
 */
export type { Easing };

export interface InterpolationOptions {
  easing?: Easing;
}

function shortestDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function normalizeAngle(a: number): number {
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** True when the segment A->B must be drawn/interpolated as a curve. */
export function segmentIsCurved(a: Keyframe, b: Keyframe): boolean {
  return a.cpOut !== undefined || b.cpIn !== undefined;
}

/**
 * The four cubic-bezier anchor/handle positions (world coords) for segment
 * A->B. Missing handles default to the collinear 1/3 and 2/3 points of the
 * chord, which makes an all-default bezier exactly reproduce the straight
 * line. Pure; shared by interpolation AND the canvas guide overlay.
 */
export function segmentControlPoints(
  a: Keyframe,
  b: Keyframe
): { p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2 } {
  const p0 = { x: a.transform.x, y: a.transform.y };
  const p3 = { x: b.transform.x, y: b.transform.y };
  const cp = (c: ControlPoint | undefined): Vec2 | null =>
    c ? { x: p0.x + c.dx, y: p0.y + c.dy } : null;

  const out = cp(a.cpOut);
  const inn = cp(b.cpIn);
  const p1 = out ?? {
    x: lerp(p0.x, p3.x, 1 / 3),
    y: lerp(p0.y, p3.y, 1 / 3),
  };
  const p2 = inn ?? {
    x: lerp(p0.x, p3.x, 2 / 3),
    y: lerp(p0.y, p3.y, 2 / 3),
  };
  return { p0, p1, p2, p3 };
}

/** De Casteljau-free closed-form cubic bezier point at parameter t ∈ [0,1]. */
export function cubicBezierPoint(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  t: number
): Vec2 {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y,
  };
}

/**
 * Map linear segment progress t ∈ [0,1] through the TEMPORAL EASE curve
 * (PRD §112 P0 "basic easing"). Pure; shared by editor + render.
 * 'hold' never reaches here (the step is taken before interpolation), and
 * 'linear' (or unknown) is the identity — so legacy scenes are untouched.
 */
export function applyEasing(easing: Easing, t: number): number {
  switch (easing) {
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return t * (2 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    default:
      return t;
  }
}

export function interpolateTransform(
  keyframes: Keyframe[],
  time: number,
  base: Transform,
  opts?: InterpolationOptions
): Transform {
  if (!keyframes || keyframes.length === 0) {
    return { ...base };
  }

  // Safe even if the incoming array is unsorted.
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (time <= first.time) return { ...first.transform };
  if (time >= last.time) return { ...last.transform };

  let a = first;
  let b = last;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time < sorted[i + 1].time) {
      a = sorted[i];
      b = sorted[i + 1];
      break;
    }
  }

  if (a.time === b.time) return { ...a.transform };

  // TEMPORAL EASING (P0): explicit option wins; otherwise the LEFT keyframe's
  // easing governs its outgoing segment (absent = 'linear' for legacy scenes).
  const easing: Easing = opts?.easing ?? a.easing ?? 'linear';

  // easing='hold': step function — hold the segment start value until the
  // segment end time is reached (no partial movement inside the segment).
  // Control points never apply to held segments.
  if (easing === 'hold') {
    return { ...a.transform };
  }

  const t = applyEasing(easing, (time - a.time) / (b.time - a.time));

  // Curved branch: control points reshape ONLY x/y. Rotation/scale/opacity
  // keep the exact linear behavior of the straight engine.
  if (segmentIsCurved(a, b)) {
    const { p0, p1, p2, p3 } = segmentControlPoints(a, b);
    const pt = cubicBezierPoint(p0, p1, p2, p3, t);
    return {
      x: pt.x,
      y: pt.y,
      rotation: normalizeAngle(
        a.transform.rotation + shortestDelta(a.transform.rotation, b.transform.rotation) * t
      ),
      scale: lerp(a.transform.scale, b.transform.scale, t),
      opacity: lerp(a.transform.opacity, b.transform.opacity, t),
    };
  }

  return {
    x: lerp(a.transform.x, b.transform.x, t),
    y: lerp(a.transform.y, b.transform.y, t),
    rotation: normalizeAngle(
      a.transform.rotation + shortestDelta(a.transform.rotation, b.transform.rotation) * t
    ),
    scale: lerp(a.transform.scale, b.transform.scale, t),
    opacity: lerp(a.transform.opacity, b.transform.opacity, t),
  };
}
