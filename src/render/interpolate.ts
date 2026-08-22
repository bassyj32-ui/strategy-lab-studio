import type { Keyframe, Transform } from '../scene/types';

/**
 * CANONICAL deterministic transform interpolation (MVP-1).
 *
 * This is the ONE shared implementation consumed by BOTH the editor timeline
 * and the Remotion render path (architecture Law 1 / PRD §65, §99). There must
 * never be a second interpolation engine.
 *
 * - Zero keyframes -> returns `base` (the object's own transform).
 * - Before first / after last -> HOLD (clamp to nearest keyframe).
 * - Between two keyframes -> LINEAR by default, or HOLD (step) if easing='hold':
 *   clamp to the segment START value until the segment end time.
 * - `rotation` uses shortest-path angular lerp (normalized to [-180, 180]);
 *   clamped boundary results return the exact stored keyframe value.
 * - `x`, `y`, `scale`, `opacity` use plain linear lerp.
 * - No bezier / easing curves in MVP-1.
 */
export type Easing = 'hold' | 'linear';

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

export function interpolateTransform(
  keyframes: Keyframe[],
  time: number,
  base: Transform,
  opts?: InterpolationOptions
): Transform {
  const easing: Easing = opts?.easing ?? 'linear';

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

  // easing='hold': step function — hold the segment start value until the
  // segment end time is reached (no partial movement inside the segment).
  if (easing === 'hold') {
    return { ...a.transform };
  }

  const t = (time - a.time) / (b.time - a.time);

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
