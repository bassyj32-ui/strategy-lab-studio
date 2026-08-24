/**
 * Shared placeholder spec for a `unit` object that has NO backing asset image.
 *
 * This constant is imported by BOTH render doors — the editor canvas
 * (`objects/ObjectNode.tsx`) and the deterministic Remotion export
 * (`render/draw.ts`) — so an asset-less unit looks byte-identical in the
 * editor preview and in the exported MP4 (REV-PASS FIX #1: parity).
 *
 * Keep this in sync with `objects/ObjectNode.tsx` and `render/draw.ts`; the
 * three must agree on color / size / label / corner radius.
 */
export const UNIT_PLACEHOLDER = {
  /** Fill color of the placeholder box (gray, matching the canvas door). */
  color: '#9ca3af',
  /** Box edge length in world units (== SHAPE_SIZE for shape parity). */
  size: 80,
  /** Single-character glyph painted centered inside the box. */
  label: 'U',
  /** Rounded-corner radius of the box (world units). */
  cornerRadius: 4,
  /** Glyph color. */
  labelColor: '#111827',
  /** Glyph font size in world units. */
  labelFontSize: 28,
} as const;
