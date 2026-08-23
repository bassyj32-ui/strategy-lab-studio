/**
 * Arrow draw-gesture math (pure, unit-tested).
 *
 * The canvas gesture collects a tail point (pointer down) and a head point
 * (pointer up) in WORLD coordinates; this module converts them into the
 * arrow's stored representation: a TAIL-ANCHORED object whose transform
 * carries position + rotation (degrees) and whose `length` spans tail→tip.
 */

/** Minimum drawn length (world units) below which the gesture is a mis-click. */
export const MIN_ARROW_DRAW_LENGTH = 12;

export interface ArrowFromDrag {
  x: number;
  y: number;
  /** DEGREES (object-transform convention). */
  rotation: number;
  length: number;
}

/**
 * Convert a drag (tail → head) into arrow placement props, or null when the
 * drag is too short to be intentional (prevents accidental dot-arrows).
 */
export function arrowFromDrag(
  tail: { x: number; y: number },
  head: { x: number; y: number }
): ArrowFromDrag | null {
  const dx = head.x - tail.x;
  const dy = head.y - tail.y;
  const length = Math.hypot(dx, dy);
  if (length < MIN_ARROW_DRAW_LENGTH) return null;
  // atan2 gives screen-space angle; Konva rotation is clockwise-positive in
  // degrees with +Y down, so no sign flip is needed.
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { x: tail.x, y: tail.y, rotation, length };
}
