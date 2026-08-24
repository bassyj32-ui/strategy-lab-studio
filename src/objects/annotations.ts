// Pure annotation constants + geometry shared by BOTH render doors (Remotion
// draw.ts and the editor ObjectNode) so what the commander sees in the canvas
// is pixel-faithful to the export (architecture Law 1). No React/Konva/canvas
// imports — testable math and lookup tables only.
import type { Asset, ConfidenceLevel, Faction, SceneObject } from '../scene/types';

/**
 * Canonical LOCAL-unit radii matching each door's placeholder geometry
 * (editor marker Ellipse r=36; export placeholder box). Rings must enclose
 * BOTH renderings so they stay stable while an asset image loads.
 */
const MARKER_RING_RADIUS = 46;
const DEFAULT_RING_RADIUS = 48;

/** PRD §31 faction colors: RED = Army A, BLUE = Army B. */
export const FACTION_COLORS: Record<Faction, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  neutral: '#9ca3af',
};

/** Restrained badge palette (PRD §37): quiet colors, uppercase short text. */
export const CONFIDENCE_META: Record<
  ConfidenceLevel,
  { text: string; color: string }
> = {
  confirmed: { text: 'CONFIRMED', color: '#22c55e' },
  probable: { text: 'PROBABLE', color: '#f5a83c' },
  disputed: { text: 'DISPUTED', color: '#ef4444' },
};

/** Ring padding beyond the object's visual bounds, LOCAL units. */
const RING_PAD = 10;

/**
 * Radius of the faction ring around an object's centre, in LOCAL world units.
 * Image-backed objects ring their intrinsic bounds; markers/shapes use their
 * canonical placeholder sizes so the ring is stable before an asset loads.
 */
export function annotationRingRadius(obj: SceneObject, asset?: Asset): number {
  if (asset) return Math.max(asset.width, asset.height) / 2 + RING_PAD;
  if (obj.type === 'marker') return MARKER_RING_RADIUS;
  return DEFAULT_RING_RADIUS;
}

/**
 * Vertical offset (LOCAL units, positive = DOWN from centre) where the name
 * label baseline chip sits: just below the ring.
 */
export function labelOffsetY(ringRadius: number): number {
  return ringRadius + 26;
}

/** Badge offset ABOVE the object (negative = up), LOCAL units. */
export function badgeOffsetY(ringRadius: number): number {
  return -(ringRadius + 30);
}
