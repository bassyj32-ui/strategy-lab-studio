import type { FormationPattern, ObjId, SceneObject, Transform, Vec2 } from '../scene/types';

/**
 * PURE hierarchy operations for groups / formations (P1 pull-forward).
 *
 * Convention (single source of truth with scene/types.ts):
 *   - An object WITHOUT `parentId` is a ROOT: its transform IS world space.
 *   - An object WITH `parentId` stores a LOCAL transform, relative to its
 *     parent's WORLD transform. World = compose(parentWorld, local) folded up
 *     the ancestor chain.
 *   - Rotation is DEGREES everywhere here (object-transform convention; only
 *     CameraState is radians-canonical).
 *
 * These functions never mutate their inputs and know nothing about the store,
 * so they are trivially unit-testable and reusable by the editor preview AND
 * the Remotion render path.
 */

/** Compose `parentWorld ∘ local` → child world transform. */
export function composeTransform(parentWorld: Transform, local: Transform): Transform {
  const rad = (parentWorld.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: parentWorld.x + (local.x * cos - local.y * sin) * parentWorld.scale,
    y: parentWorld.y + (local.x * sin + local.y * cos) * parentWorld.scale,
    rotation: parentWorld.rotation + local.rotation,
    scale: parentWorld.scale * local.scale,
    opacity: parentWorld.opacity * local.opacity,
  };
}

/** Map a WORLD-space point into the parent's LOCAL frame. */
export function worldPointToLocal(parentWorld: Transform, wx: number, wy: number): Vec2 {
  const dx = wx - parentWorld.x;
  const dy = wy - parentWorld.y;
  const rad = (-parentWorld.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const s = parentWorld.scale !== 0 ? parentWorld.scale : 1;
  return { x: (dx * cos - dy * sin) / s, y: (dx * sin + dy * cos) / s };
}

/**
 * Map a small WORLD-space DELTA (e.g. a drag delta) into the parent's LOCAL
 * frame. Deltas ignore translation — only rotation and scale apply.
 */
export function worldDeltaToLocal(parentWorld: Transform, dxw: number, dyw: number): Vec2 {
  return worldPointToLocal({ ...parentWorld, x: 0, y: 0 }, dxw, dyw);
}

/**
 * Ancestor chain of `id`, ordered ROOT → … → direct parent. Defensive against
 * malformed data: a visited set stops corrupted cycles instead of hanging.
 */
export function ancestors(objects: Record<ObjId, SceneObject>, id: ObjId): ObjId[] {
  const chain: ObjId[] = [];
  const seen = new Set<ObjId>([id]);
  let cur = objects[id]?.parentId;
  while (cur && !seen.has(cur)) {
    chain.unshift(cur);
    seen.add(cur);
    cur = objects[cur]?.parentId;
  }
  return chain;
}

/**
 * True if re-parenting `childId` under `newParentId` would create a cycle
 * (i.e. newParentId IS the child or one of its descendants). Reparenting to
 * root (`newParentId === null`) can never cycle.
 */
export function wouldCreateCycle(
  objects: Record<ObjId, SceneObject>,
  childId: ObjId,
  newParentId: ObjId | null
): boolean {
  if (!newParentId) return false;
  // Walk UP from the candidate parent via parentId links; reaching childId
  // means the child is an ancestor of the target → re-parenting would make it
  // its own ancestor (cycle). Covers self-targets too.
  let cur: ObjId | undefined = newParentId;
  const seen = new Set<ObjId>();
  while (cur !== undefined && !seen.has(cur)) {
    if (cur === childId) return true;
    seen.add(cur);
    cur = objects[cur]?.parentId;
  }
  return false;
}

/**
 * Reparenting validation: target must exist (unless null = root), must not be
 * the child itself, and must not create a cycle.
 */
export function canReparent(
  objects: Record<ObjId, SceneObject>,
  childId: ObjId,
  newParentId: ObjId | null
): boolean {
  if (newParentId === null) return true;
  if (!objects[newParentId]) return false;
  if (childId === newParentId) return false;
  return !wouldCreateCycle(objects, childId, newParentId);
}

/** The object's WORLD transform: its local transform folded up the chain. */
export function resolveWorldTransform(
  objects: Record<ObjId, SceneObject>,
  id: ObjId
): Transform {
  const obj = objects[id];
  let world: Transform = obj
    ? { ...obj.transform }
    : { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };
  for (const ancId of ancestors(objects, id)) {
    world = composeTransform({ ...objects[ancId].transform }, world);
  }
  return world;
}

/**
 * Direct children of `id`. Deterministic order (ascending ObjId) so callers
 * that iterate children behave identically across runs.
 */
export function directChildren(
  objects: Record<ObjId, SceneObject>,
  id: ObjId
): SceneObject[] {
  return Object.values(objects)
    .filter((o) => o.parentId === id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** All descendants (children, grandchildren, …), deterministic order. */
export function descendants(
  objects: Record<ObjId, SceneObject>,
  id: ObjId
): SceneObject[] {
  const out: SceneObject[] = [];
  const queue = directChildren(objects, id);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    out.push(cur);
    queue.push(...directChildren(objects, cur.id));
  }
  return out;
}

/**
 * The "moveable roots" of a selection: selected objects none of whose
 * ancestors are ALSO selected. Moving these by one world delta moves exactly
 * the visual selection once — descendants follow through locality, and
 * parent+child pairs never double-move.
 */
export function selectionRoots(
  objects: Record<ObjId, SceneObject>,
  ids: ObjId[]
): ObjId[] {
  const set = new Set(ids);
  return ids.filter((id) =>
    !ancestors(objects, id).some((anc) => set.has(anc))
  );
}

// ---------------------------------------------------------------------------
// Formation layout math (pure; +X = forward/right, +Y = down — screen convention)
// ---------------------------------------------------------------------------

/**
 * Local-frame offsets for `count` members of a formation, CENTERED on the
 * anchor point — line/column/grid place the whole rank/file/block symmetric
 * around offset (0,0). The wedge is the exception: its apex (index 0) sits
 * exactly at the anchor and the V opens BACKWARD (-X):
 *   line   — horizontal rank, centered on the anchor
 *   column — vertical file, centered on the anchor
 *   wedge  — V opening BACKWARD (-X), apex at the anchor
 *   grid   — near-square block, centered on the anchor
 */
export function formationOffsets(
  pattern: FormationPattern,
  count: number,
  spacing: number
): Vec2[] {
  if (count <= 0) return [];
  // Line/column/grid CENTER THE WHOLE FORMATION on the anchor point (the
  // drop position is the middle of the rank/file/block, not its first cell).
  // The wedge is the exception: its APEX sits exactly at the anchor.
  const offsets: Vec2[] = [];

  const centered = (index: number, total: number): number =>
    (index - (total - 1) / 2) * spacing;

  switch (pattern) {
    case 'line':
      // Shoulder-to-shoulder horizontal rank.
      for (let i = 0; i < count; i++) offsets.push({ x: centered(i, count), y: 0 });
      break;
    case 'column':
      // One behind another, vertical file.
      for (let i = 0; i < count; i++) offsets.push({ x: 0, y: centered(i, count) });
      break;
    case 'wedge': {
      // Alternate left/right per rank behind the apex: rank r sits at
      // x = -r*spacing, y = ±r*spacing. Apex (index 0) at the anchor.
      offsets.push({ x: 0, y: 0 });
      for (let i = 1; i < count; i++) {
        const rank = Math.ceil(i / 2);
        const side = i % 2 === 1 ? -1 : 1;
        offsets.push({ x: -rank * spacing, y: side * rank * spacing });
      }
      break;
    }
    case 'grid': {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      let placed = 0;
      for (let row = 0; row < rows && placed < count; row++) {
        for (let col = 0; col < cols && placed < count; col++) {
          offsets.push({
            x: centered(col, cols),
            y: centered(row, rows),
          });
          placed++;
        }
      }
      break;
    }
  }
  return offsets;
}

/**
 * CapCut drag law helper: the ROOT of `id`'s group (topmost ancestor), or
 * `id` itself when it is a root. Cycle-safe via ancestors().
 */
export function groupRootOf(objects: Record<ObjId, SceneObject>, id: ObjId): ObjId {
  const chain = ancestors(objects, id);
  return chain.length > 0 ? chain[0] : id;
}
