import type { Scene, ObjId, Transform, Keyframe, TrainFollowConfig } from '../scene/types';
import { interpolateTransform } from './interpolate';
import { composeTransform, directChildren } from '../objects/groups';
import { pathLength, sampleAtPath, tangentAtDistance } from '../objects/pathGeometry';

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
 * Compute the train-follow world transform for a child object.
 *
 * The child's parent has a `TrainFollowConfig` that references a path object.
 * Children traverse the path's arc-length parameterization with per-child
 * distance offsets. The leader (first child by id) is at the front; each
 * subsequent child trails behind by `spacing` world units.
 */
function trainFollowWorldTransform(
  scene: Scene,
  childId: ObjId,
  parentId: ObjId,
  cfg: TrainFollowConfig,
  time: number
): Transform {
  const parent = scene.objects[parentId];
  const pathKeyframes = scene.keyframes[cfg.pathObjId] ?? [];
  if (pathKeyframes.length < 2 || !parent) {
    const base = scene.objects[childId]?.transform ?? {
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      opacity: 1,
    };
    const parentWorld = parent
      ? getObjectWorldTransformAtTime(scene, parentId, time)
      : { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };
    return composeTransform(parentWorld, base);
  }

  const sorted = [...pathKeyframes].sort((a, b) => a.time - b.time);
  const pathStart = sorted[0].time;
  const pathEnd = sorted[sorted.length - 1].time;
  const pathDuration = Math.max(pathEnd - pathStart, 1e-6);
  const totalLen = pathLength(pathKeyframes);

  if (totalLen <= 0) {
    const base = scene.objects[childId]?.transform ?? {
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      opacity: 1,
    };
    const parentWorld = getObjectWorldTransformAtTime(scene, parentId, time);
    return composeTransform(parentWorld, base);
  }

  const progress = Math.max(
    0,
    Math.min(1, ((time - pathStart) * cfg.speed) / pathDuration)
  );
  const leaderDist = progress * totalLen;

  const siblings = directChildren(scene.objects, parentId);
  const idx = siblings.findIndex((s) => s.id === childId);
  const childDist = Math.max(0, leaderDist - idx * cfg.spacing);

  const pos = sampleAtPath(pathKeyframes, childDist);
  if (!pos) {
    const base = scene.objects[childId]?.transform ?? {
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      opacity: 1,
    };
    const parentWorld = getObjectWorldTransformAtTime(scene, parentId, time);
    return composeTransform(parentWorld, base);
  }

  let rotation = 0;
  if (cfg.rotationFollow) {
    const tan = tangentAtDistance(pathKeyframes, childDist);
    if (tan) {
      rotation = (Math.atan2(tan.y, tan.x) * 180) / Math.PI;
    }
  }

  const parentWorld = getObjectWorldTransformAtTime(scene, parentId, time);
  const base = scene.objects[childId]?.transform ?? {
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    opacity: 1,
  };
  const local: Transform = {
    x: pos.x - parentWorld.x,
    y: pos.y - parentWorld.y,
    rotation: rotation - parentWorld.rotation,
    scale: base.scale,
    opacity: base.opacity,
  };
  return composeTransform(parentWorld, local);
}

/**
 * World-space transform of `objId` at time `t`, folding the parent chain.
 * A root object's local transform is its world transform; a child's local
 * transform is composed under each ancestor's WORLD transform (so an animated
 * parent carries its children). This is the single source of truth used by the
 * Remotion render path so grouping is visible in the exported video.
 *
 * TRAIN/SNAKE: when the parent has a `trainFollow` config, the child's
 * position is computed from the shared path's arc-length parameterization
 * instead of its own keyframes.
 */
export function getObjectWorldTransformAtTime(
  scene: Scene,
  objId: ObjId,
  time: number
): Transform {
  const obj = scene.objects[objId];
  if (obj?.parentId) {
    const parent = scene.objects[obj.parentId];
    if (parent?.trainFollow) {
      return trainFollowWorldTransform(
        scene,
        objId,
        obj.parentId,
        parent.trainFollow,
        time
      );
    }
  }
  const local = getObjectTransformAtTime(scene, objId, time);
  if (!obj?.parentId) return local;
  const parentWorld = getObjectWorldTransformAtTime(scene, obj.parentId, time);
  return composeTransform(parentWorld, local);
}
