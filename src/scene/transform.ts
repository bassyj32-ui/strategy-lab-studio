import type { Transform } from './types';

/** A neutral, fully-opaque, unrotated, unit-scaled transform at the origin. */
export function defaultTransform(): Transform {
  return { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };
}

/**
 * Merge a partial transform into a base transform. This is the fix for the
 * partial-merge bug: only the provided keys are overwritten, and `undefined`
 * values never clobber an existing field (e.g. `{ x: undefined }` keeps x).
 */
export function mergeTransform(base: Transform, partial: Partial<Transform>): Transform {
  return {
    x: partial.x ?? base.x,
    y: partial.y ?? base.y,
    rotation: partial.rotation ?? base.rotation,
    scale: partial.scale ?? base.scale,
    opacity: partial.opacity ?? base.opacity,
  };
}
