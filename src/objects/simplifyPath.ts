/**
 * Douglas-Peucker path simplification. Pure math — no React/store imports.
 * Reduces a dense freehand stroke to a small set of waypoints while
 * preserving the overall shape within `epsilon` tolerance.
 */

import type { Pt } from '../canvas/gizmo';

/** Squared distance between two points (avoids sqrt). */
function distSq(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Perpendicular distance squared from point P to line segment AB. */
function perpendicularDistSq(p: Pt, a: Pt, b: Pt): number {
  const lenSq = distSq(a, b);
  if (lenSq === 0) return distSq(p, a);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // t = projection of P onto AB, clamped to [0,1]
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return distSq(p, proj);
}

/**
 * Simplify a polyline using the Douglas-Peucker algorithm.
 *
 * @param points - The original dense point array (freehand stroke)
 * @param epsilon - Maximum perpendicular distance tolerance (world units).
 *                  Smaller = more faithful to original; larger = fewer points.
 * @returns Simplified point array (always includes first and last point)
 */
export function simplifyPath(points: Pt[], epsilon: number): Pt[] {
  if (points.length <= 2) return [...points];

  // Find the point with maximum distance from the line (first → last)
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistSq(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  // If max distance exceeds epsilon, recursively simplify both halves
  if (maxDist > epsilon * epsilon) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPath(points.slice(maxIdx), epsilon);
    // Merge: left + right (skip duplicate at junction)
    return [...left.slice(0, -1), ...right];
  }

  // All intermediate points are within tolerance — just keep endpoints
  return [first, last];
}
