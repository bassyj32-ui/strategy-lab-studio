// Pure §32 SIGNATURE ARROW specs shared by BOTH render doors (Remotion
// draw.ts and the editor ObjectNode) so what the commander sees in the canvas
// is pixel-faithful to the export (architecture Law 1). No React/Konva/canvas
// imports — lookup tables only.
import type { ArrowStyle } from '../scene/types';

export interface ArrowStyleSpec {
  /** Shaft stroke width, LOCAL world units. */
  shaftWidth: number;
  /** Arrowhead length along the shaft axis, LOCAL units. */
  headLength: number;
  /** Half-width of the arrowhead base, LOCAL units. */
  headHalfWidth: number;
  /** Multiplied into the object's own opacity by both doors. */
  opacity: number;
  /**
   * Dash pattern in LOCAL units ([on, off]); undefined = solid line.
   * Both doors scale it with camera zoom so world-space dash rhythm is
   * consistent at any zoom.
   */
  dash?: number[];
}

/**
 * Canonical style table. 'attack' reproduces the pre-branding geometry
 * exactly (shaft 6 / head 18×11, opaque, solid) so scenes without
 * arrowStyle render byte-identically.
 */
export const ARROW_STYLES: Record<ArrowStyle, ArrowStyleSpec> = {
  attack: { shaftWidth: 6, headLength: 18, headHalfWidth: 11, opacity: 1 },
  movement: {
    shaftWidth: 4,
    headLength: 14,
    headHalfWidth: 9,
    opacity: 0.85,
    dash: [12, 8],
  },
  flank: { shaftWidth: 5, headLength: 22, headHalfWidth: 14, opacity: 0.95 },
  retreat: {
    shaftWidth: 4,
    headLength: 14,
    headHalfWidth: 9,
    opacity: 0.7,
    dash: [6, 6],
  },
  encirclement: {
    shaftWidth: 5,
    headLength: 20,
    headHalfWidth: 13,
    opacity: 0.9,
    dash: [2, 7],
  },
  charge: { shaftWidth: 8, headLength: 24, headHalfWidth: 15, opacity: 1 },
};

/** Absent `arrowStyle` falls back here (the original look). */
export const DEFAULT_ARROW_STYLE: ArrowStyle = 'attack';

/** Total spec for an object's optional style tag (pure, total function). */
export function arrowStyleSpec(style?: ArrowStyle): ArrowStyleSpec {
  return ARROW_STYLES[style ?? DEFAULT_ARROW_STYLE];
}
