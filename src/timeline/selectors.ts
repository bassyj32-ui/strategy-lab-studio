import type { Scene, ObjId, Transform, Keyframe } from '../scene/types';
import { interpolateTransform } from './interpolate';

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
