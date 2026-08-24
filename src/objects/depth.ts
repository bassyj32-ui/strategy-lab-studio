import type { LayerId, ObjId, SceneObject } from '../scene/types';

/**
 * Depth/z-ordering (PRD §48): objects can carry an optional `z`; higher
 * values render LATER (on top). Objects without `z` behave as 0 and keep
 * their previous relative order (stable sort), so existing scenes render
 * byte-identically until a user actually sets depth.
 */
export function sortForRender<T extends SceneObject>(objs: T[]): T[] {
  return objs
    .map((obj, i) => ({ obj, i }))
    .sort(
      (a, b) =>
        (a.obj.z ?? 0) - (b.obj.z ?? 0) || a.i - b.i
    )
    .map(({ obj }) => obj);
}

/**
 * The z value just ABOVE every current sibling in `layerId` (for "bring
 * forward to front" semantics). Returns 1 when the layer is otherwise empty.
 */
export function nextZAbove(
  objs: SceneObject[],
  layerId: LayerId,
  id: ObjId
): number {
  const max = Math.max(
    0,
    ...objs.filter((o) => o.layerId === layerId && o.id !== id).map((o) => o.z ?? 0)
  );
  return max + 1;
}

/** The z value just BELOW every current sibling (min-1, floor at -1 avoided). */
export function nextZBelow(
  objs: SceneObject[],
  layerId: LayerId,
  id: ObjId
): number {
  const siblings = objs.filter((o) => o.layerId === layerId && o.id !== id);
  if (siblings.length === 0) return -1;
  return (
    Math.min(...siblings.map((o) => o.z ?? 0)) - 1
  );
}
