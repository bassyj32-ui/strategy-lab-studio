import type { Layer, Scene, SceneObject } from './types';

/** Visible layers sorted by their `order` (ascending). Hidden layers excluded. */
export function visibleLayersOrdered(scene: Scene): Layer[] {
  return [...scene.layers]
    .filter((layer) => layer.visible)
    .sort((a, b) => a.order - b.order);
}

/** All objects assigned to a given layer. */
export function objectsForLayer(scene: Scene, layerId: string): SceneObject[] {
  return Object.values(scene.objects).filter((obj) => obj.layerId === layerId);
}

/**
 * The currently selected object, derived from store-root `selectedObjId`.
 * `selectedObjId` lives OUTSIDE the Scene and is excluded from undo snapshots,
 * so this reads it from the store state rather than from the Scene.
 */
export function selectedObject(state: {
  selectedObjId: string | null;
  scene: Scene;
}): SceneObject | undefined {
  if (!state.selectedObjId) return undefined;
  return state.scene.objects[state.selectedObjId];
}
