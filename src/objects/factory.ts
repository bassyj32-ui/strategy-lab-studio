import type {
  AssetId,
  SceneObject,
  SceneObjectType,
  Transform,
} from '../scene/types';
import { defaultTransform } from '../scene/transform';

export interface CreateObjectOpts {
  id: string;
  layerId: string;
  assetId?: AssetId;
  /** Initial world position (object center). Defaults to (0, 0). */
  x?: number;
  y?: number;
  /**
   * Initial rotation in DEGREES (object-transform convention in this codebase;
   * only CameraState is radians-canonical — see render/draw.ts conversion).
   */
  rotation?: number;
  /** ARROW-ONLY: local-space shaft length. Defaults to DEFAULT_ARROW_LENGTH. */
  length?: number;
  /** ARROW-ONLY: explicit stroke color override. */
  color?: string;
}

/** Default arrow shaft length in world units (tail → tip). */
export const DEFAULT_ARROW_LENGTH = 120;
/** Default arrow stroke color — Signals Console amber. */
export const DEFAULT_ARROW_COLOR = '#f5a83c';

function withTransform(opts: CreateObjectOpts): Transform {
  const t = defaultTransform();
  if (opts.x !== undefined) t.x = opts.x;
  if (opts.y !== undefined) t.y = opts.y;
  if (opts.rotation !== undefined) t.rotation = opts.rotation;
  return t;
}

/** Blue rectangle placeholder (MVP-1 palette item). */
export function createShape(opts: CreateObjectOpts): SceneObject {
  return {
    id: opts.id,
    type: 'shape',
    assetId: opts.assetId,
    transform: withTransform(opts),
    layerId: opts.layerId,
  };
}

/** Red ellipse marker (MVP-1 palette item). */
export function createMarker(opts: CreateObjectOpts): SceneObject {
  return {
    id: opts.id,
    type: 'marker',
    assetId: opts.assetId,
    transform: withTransform(opts),
    layerId: opts.layerId,
  };
}

/**
 * GRAY placeholder for a future unit (RESERVED, NOT in the MVP-1 palette).
 * Included so the object system is uniform and ready for asset import later.
 */
export function createUnit(opts: CreateObjectOpts): SceneObject {
  return {
    id: opts.id,
    type: 'unit',
    assetId: opts.assetId,
    transform: withTransform(opts),
    layerId: opts.layerId,
  };
}

/**
 * Attack/movement arrow (MVP-2, owner-approved unfreeze). Tail sits at the
 * object origin; the tip lies `length` local units along +X, so transform
 * rotation/scale orient and size the whole arrow. Keyframes work unchanged.
 */
export function createArrow(opts: CreateObjectOpts): SceneObject {
  return {
    id: opts.id,
    type: 'arrow',
    assetId: opts.assetId,
    transform: withTransform(opts),
    layerId: opts.layerId,
    length: opts.length ?? DEFAULT_ARROW_LENGTH,
    color: opts.color ?? DEFAULT_ARROW_COLOR,
  };
}

/**
 * ORGANIZATIONAL group container (P1 pull-forward). Never painted itself; its
 * children render relative to its transform. Not exposed in the palette.
 */
export function createGroup(opts: CreateObjectOpts): SceneObject {
  return {
    id: opts.id,
    type: 'group',
    assetId: opts.assetId,
    transform: withTransform(opts),
    layerId: opts.layerId,
  };
}

export function createSceneObject(
  type: SceneObjectType,
  opts: CreateObjectOpts
): SceneObject {
  switch (type) {
    case 'shape':
      return createShape(opts);
    case 'marker':
      return createMarker(opts);
    case 'unit':
      return createUnit(opts);
    case 'arrow':
      return createArrow(opts);
    case 'group':
      return createGroup(opts);
  }
}
