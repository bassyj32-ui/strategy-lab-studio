/**
 * Shared drop-shadow constants for battlefield objects.
 *
 * Single source of truth for BOTH render doors: the Remotion 2D-canvas export
 * (src/render/draw.ts) and the Konva editor preview (src/objects/ObjectNode).
 * All values are FIXED constants — no randomness, no time-of-day, no
 * per-object variation beyond camera scale — so a shadowed frame is
 * byte-identical across renders. Offsets/blur multiply by screen scale so the
 * shadow stays world-consistent at any zoom.
 */
export const SHADOW_COLOR = 'rgba(0, 0, 0, 0.45)';
export const SHADOW_BLUR = 12;
export const SHADOW_OFFSET_X = 4;
export const SHADOW_OFFSET_Y = 6;
