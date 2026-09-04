/**
 * Pure math for the on-canvas selection gizmos + Selection HUD (Wave-3 UX).
 * NO React / store / Konva imports — fully unit-testable. The caller supplies
 * all geometry numbers; this module never reads scene data.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Local-unit bounding box of an object around its anchor (tail for arrows). */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 20;

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Offset (local units) of a box corner from the anchor. */
export function cornerOffset(
  box: Box,
  cx: 'min' | 'max',
  cy: 'min' | 'max'
): Pt {
  return { x: cx === 'min' ? box.minX : box.maxX, y: cy === 'min' ? box.minY : box.maxY };
}

/** Rotate a local offset by `deg` (screen convention: +y down, CW positive). */
export function rotatedOffset(dx: number, dy: number, deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** World-space position of a box corner for an object with `rotation`/`scale`. */
export function cornerWorld(
  anchor: Pt,
  box: Box,
  rotationDeg: number,
  scale: number,
  cx: 'min' | 'max',
  cy: 'min' | 'max'
): Pt {
  const off = cornerOffset(box, cx, cy);
  const rot = rotatedOffset(off.x * scale, off.y * scale, rotationDeg);
  return { x: anchor.x + rot.x, y: anchor.y + rot.y };
}

/** World position of the rotation stalk tip: `stalkLen` local units above the box's top-center. */
export function stalkWorld(
  anchor: Pt,
  box: Box,
  rotationDeg: number,
  scale: number,
  stalkLen: number
): Pt {
  const rise = rotatedOffset(0, -(boxHeight(box) / 2 + stalkLen) * scale, rotationDeg);
  return { x: anchor.x + rise.x, y: anchor.y + rise.y };
}

/** World position of the box's top-center edge (stalk BASE — the line starts here, not at NW). */
export function topCenterWorld(
  anchor: Pt,
  box: Box,
  rotationDeg: number,
  scale: number
): Pt {
  const cx = (box.minX + box.maxX) / 2;
  const off = rotatedOffset(cx * scale, box.minY * scale, rotationDeg);
  return { x: anchor.x + off.x, y: anchor.y + off.y };
}

/** World position of an edge-midpoint handle (n/s/e/w). Uniform scale for now. */
export function edgeWorld(
  anchor: Pt,
  box: Box,
  rotationDeg: number,
  scale: number,
  edge: 'n' | 's' | 'e' | 'w'
): Pt {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const lx = edge === 'w' ? box.minX : edge === 'e' ? box.maxX : cx;
  const ly = edge === 'n' ? box.minY : edge === 's' ? box.maxY : cy;
  const rot = rotatedOffset(lx * scale, ly * scale, rotationDeg);
  return { x: anchor.x + rot.x, y: anchor.y + rot.y };
}

/**
 * Figma-style axis lock: keep only the dominant world axis (Shift held).
 * Returns the locked delta — call with the gesture-total delta, not per-event.
 */
export function axisLockDelta(dx: number, dy: number): Pt {
  return Math.abs(dx) >= Math.abs(dy) ? { x: dx, y: 0 } : { x: 0, y: dy };
}

/** Grid snap for a world coordinate (0/<=0 disables). */
export function snapPos(v: number, grid = 0): number {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

/** Keyboard nudge step: 1px, Shift = 10px (Figma-style). */
export function nudgeStep(shift: boolean): number {
  return shift ? 10 : 1;
}

/**
 * Shortest-path angle delta: keeps continuous rotation across the ±180 seam
 * so dragging through "down" doesn't jump the object (prev = last applied).
 */
export function continuousDeg(prev: number, next: number): number {
  let d = (next - prev) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return normalizeDeg(prev + d);
}

export function boxWidth(box: Box): number {
  return box.maxX - box.minX;
}

export function boxHeight(box: Box): number {
  return box.maxY - box.minY;
}

/** Pointer angle relative to the anchor, degrees, 0° = straight up, CW+. */
export function rotationFromPointer(anchor: Pt, p: Pt): number {
  const dx = p.x - anchor.x;
  const dy = p.y - anchor.y;
  if (dx === 0 && dy === 0) return 0;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return normalizeDeg(deg + 90);
}

export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Snap to the nearest multiple of `step` (used with Shift held). */
export function snapDeg(deg: number, step = 15): number {
  if (step <= 0) return deg;
  return Math.round(deg / step) * step;
}

/**
 * Multiplicative scale from a corner-handle drag: doubling the pointer's
 * distance from the anchor doubles the scale (feels natural at every zoom).
 */
export function scaleFromDrag(
  startScale: number,
  startDist: number,
  curDist: number
): number {
  if (startDist <= 0.0001) return clampScale(startScale);
  return clampScale(startScale * (curDist / startDist));
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * HUD scrub: horizontal px dragged → value change. Shift = 10× finer.
 */
export function scrubValue(
  startValue: number,
  dxPx: number,
  unitsPerPx: number,
  fine: boolean
): number {
  return startValue + dxPx * unitsPerPx * (fine ? 0.1 : 1);
}

/**
 * Convert a WORLD-space delta into the object's PARENT frame (identity for
 * roots). Used by HUD position-scrubbing so grouped children move correctly
 * even when the parent is rotated/scaled.
 */
export function localDeltaForWorldDelta(
  worldToLocal: (x: number, y: number) => Pt,
  dwx: number,
  dwy: number
): Pt {
  const o = worldToLocal(0, 0);
  const d = worldToLocal(dwx, dwy);
  return { x: d.x - o.x, y: d.y - o.y };
}
