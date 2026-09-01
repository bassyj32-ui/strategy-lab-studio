import type { ObjId, Scene } from '../scene/types';
import { getObjectWorldTransformAtTime } from '../timeline/selectors';
import { groupRootOf } from '../objects/groups';

/**
 * Marquee box-select: pure math, no React/Konva. The editor preview and any
 * future multi-select consumers share these rules so they never disagree on
 * who a rubber-band rectangle selects.
 */

/** Normalized world-space rect (min/max), drag direction agnostic. */
export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Normalize any two world points into a min/max rect (handles up/left drags). */
export function worldRectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): WorldRect {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

/** Point-in-rect (inclusive bounds — touching edges selects). */
export function worldRectContains(
  rect: WorldRect,
  x: number,
  y: number,
): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

/**
 * Every object whose WORLD ANCHOR (its composed transform origin at `time`)
 * falls inside `rect`, collapsed to topmost ANCESTOR ROOTS so a box around
 * grouped members yields the group itself — the drag-as-one law already used
 * by shift-click multi-selection. Objects on hidden layers never qualify.
 */
export function objectsInWorldRect(
  scene: Scene,
  rect: WorldRect,
  currentTime: number,
): ObjId[] {
  if (rect.maxX < rect.minX || rect.maxY < rect.minY) return [];
  const visibleLayerIds = new Set(
    scene.layers.filter((l) => l.visible).map((l) => l.id),
  );
  const roots = new Set<ObjId>();
  for (const obj of Object.values(scene.objects)) {
    if (!visibleLayerIds.has(obj.layerId)) continue;
    const t = getObjectWorldTransformAtTime(scene, obj.id, currentTime);
    if (worldRectContains(rect, t.x, t.y)) {
      // Promote to the topmost ancestor so a box around group members selects
      // the group (moving it drags the whole hierarchy as one).
      roots.add(groupRootOf(scene.objects, obj.id));
    }
  }
  return Array.from(roots);
}