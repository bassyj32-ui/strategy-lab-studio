import type { Keyframe, ObjId, Transform } from '../scene/types';
import { useSceneStore } from '../scene/store';

/**
 * Thin imperative wrappers over the scene-store keyframe CRUD. The scene store
 * remains the single source of truth; these helpers exist so tests and UI can
 * mutate keyframes without reaching into React.
 */
export function addKeyframe(objId: ObjId, keyframe: Keyframe): void {
  useSceneStore.getState().addKeyframe(objId, keyframe);
}

export function setKeyframeAtTime(objId: ObjId, time: number): void {
  useSceneStore.getState().setKeyframeAtTime(objId, time);
}

export function updateKeyframe(
  objId: ObjId,
  time: number,
  patch: { time?: number; transform?: Partial<Transform> }
): void {
  useSceneStore.getState().updateKeyframe(objId, time, patch);
}

export function removeKeyframe(objId: ObjId, time: number): void {
  useSceneStore.getState().removeKeyframe(objId, time);
}
