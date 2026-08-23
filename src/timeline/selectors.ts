import type { Scene, ObjId, Transform, Keyframe } from '../scene/types';
import { interpolateTransform } from './interpolate';
import { composeTransform } from '../objects/groups';

/**
 * Single consumption path for transforms over time: both the live canvas
 * preview and the Remotion render call this pure selector, backed by ONE
 * shared interpolation implementation in src/render/interpolate.ts (this
 * module's ./interpolate is a delegation shim, not a second engine).
 */
export function getObjectTransformAtTime(
  scene: Scene,
  objId: ObjId,
  time: number
): Transform {
  const obj = scene.objects[objId];
  const base: Transform = obj
    ? obj.transform
    : { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };
  const kfs = scene.keyframes[objId] ?? [];
  return interpolateTransform(kfs, time, base);
}

export function getObjectKeyframes(scene: Scene, objId: ObjId): Keyframe[] {
  return scene.keyframes[objId] ?? [];
}

/**
 * World-space transform of `objId` at time `t`, folding the parent chain.
 * A root object's local transform is its world transform; a child's local
 * transform is composed under each ancestor's WORLD transform (so an animated
 * parent carries its children). This is the single source of truth used by the
 * Remotion render path so grouping is visible in the exported video.
 */
export function getObjectWorldTransformAtTime(
  scene: Scene,
  objId: ObjId,
  time: number
): Transform {
  const obj = scene.objects[objId];
  const local = getObjectTransformAtTime(scene, objId, time);
  if (!obj?.parentId) return local;
  const parentWorld = getObjectWorldTransformAtTime(scene, obj.parentId, time);
  return composeTransform(parentWorld, local);
}
