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
}

function withTransform(opts: CreateObjectOpts): Transform {
  const t = defaultTransform();
  if (opts.x !== undefined) t.x = opts.x;
  if (opts.y !== undefined) t.y = opts.y;
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
  }
}
