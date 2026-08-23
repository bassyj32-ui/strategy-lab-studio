import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current, type Draft } from 'immer';
import type {
  Asset,
  AssetId,
  CameraState,
  Keyframe,
  LayerId,
  ObjId,
  Scene,
  SceneObject,
  SceneObjectType,
  Transform,
} from './types';
import { createDefaultScene, DEFAULT_LAYER_ID } from './factory';
import { createId } from './id';
import { mergeTransform } from './transform';
import { createSceneObject } from '../objects/factory';
import type { ImportMapOptions } from '../assets/types';
import { importMapAsset } from '../assets/import';

const MAX_HISTORY = 100;

/** Push a deep snapshot of the current Scene onto `past` and clear `future`. */
function pushHistory(state: Draft<SceneState>) {
  state.past.push(current(state.scene));
  if (state.past.length > MAX_HISTORY) state.past.shift();
  state.future = [];
}

/** Structural equality used to drop no-op undo entries on `endInteraction`. */
function scenesEqual(a: Scene, b: Scene): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface SceneState {
  /** Single source of truth for editor + (future) render. */
  scene: Scene;
  /** Undo / redo stacks of full Scene snapshots. */
  past: Scene[];
  future: Scene[];

  // ---- Selection / active layer: STORE-ROOT, excluded from Scene + undo ----
  selectedObjId: ObjId | null;
  activeLayerId: LayerId;

  // ---- History primitives ----
  /** Apply a discrete mutation as a single undoable transaction. */
  transaction: <T>(fn: (scene: Scene) => T) => T;
  /** Begin a coalesced gesture (e.g. a drag): snapshot once. */
  beginInteraction: () => void;
  /** End a coalesced gesture: drop the snapshot if nothing changed. */
  endInteraction: () => void;
  undo: () => void;
  redo: () => void;

  // ---- Object creation / editing ----
  createObjectOfType: (
    type: SceneObjectType,
    opts?: {
      assetId?: AssetId;
      x?: number;
      y?: number;
      /** ARROW-ONLY. */
      length?: number;
      /** ARROW-ONLY. */
      color?: string;
    }
  ) => ObjId;
  addObject: (obj: SceneObject) => void;
  updateTransform: (id: ObjId, partial: Partial<Transform>) => void;
  /** Drag helper: nudge an object by a delta (no extra snapshot). */
  moveObjectBy: (id: ObjId, dx: number, dy: number) => void;

  // ---- Keyframes (single source of truth: scene.keyframes, PRD §65/§99) ----
  /** Insert (or replace at the same time) a keyframe; array kept sorted by time. */
  addKeyframe: (objId: ObjId, keyframe: Keyframe) => void;
  /** Capture the object's CURRENT base transform as a keyframe at `time`. */
  setKeyframeAtTime: (objId: ObjId, time: number) => void;
  /** Patch an existing keyframe's time and/or transform. */
  updateKeyframe: (
    objId: ObjId,
    time: number,
    patch: { time?: number; transform?: Partial<Transform> }
  ) => void;
  /** Remove the keyframe at `time` (identity within an object is its time). */
  removeKeyframe: (objId: ObjId, time: number) => void;

  // ---- Layers ----
  addLayer: (name: string) => void;
  renameLayer: (id: LayerId, name: string) => void;
  toggleLayerVisible: (id: LayerId) => void;
  reorderLayers: (id: LayerId, direction: 'up' | 'down') => void;
  removeLayer: (id: LayerId) => void;

    // ---- Selection / active layer (store-root, never undoable) ----
    setSelected: (id: ObjId | null) => void;
    setActiveLayer: (id: LayerId) => void;

    // ---- Camera (single source of truth: Scene.camera, PRD §87) ----
    /** Writes a NEW camera state derived by `updater`; never mutates in place. */
    updateCamera: (updater: (cam: CameraState) => CameraState) => void;

    // ---- Asset / map registry writes ----
    /** Insert-only asset registry write (additive, never overwrites). */
    registerAsset: (asset: Asset) => void;
    /** Imports a map file, registers it, points mapAssetId + worldSize at it. */
    importMap: (file: File, opts?: ImportMapOptions) => Promise<void>;
  }

export const useSceneStore = create<SceneState>()(
  immer((set, get) => ({
    scene: createDefaultScene(),
    past: [],
    future: [],
    selectedObjId: null,
    activeLayerId: DEFAULT_LAYER_ID,

    transaction: (fn) => {
      let result: ReturnType<typeof fn>;
      set((state) => {
        pushHistory(state);
        result = fn(state.scene);
      });
      return result!;
    },

    beginInteraction: () => {
      set((state) => {
        pushHistory(state);
      });
    },

    endInteraction: () => {
      set((state) => {
        const last = state.past[state.past.length - 1];
        if (last && scenesEqual(last, state.scene)) {
          state.past.pop();
        }
      });
    },

    undo: () => {
      set((state) => {
        const prev = state.past.pop();
        if (!prev) return;
        state.future.unshift(current(state.scene));
        // Camera is NAVIGATION state, not undoable content: keep the live view
        // so restoring content never teleports the viewport (PRD §87).
        const liveCamera = current(state.scene.camera);
        state.scene = prev;
        state.scene.camera = liveCamera;
        // Selection lives outside the Scene; clear it if its object vanished.
        if (state.selectedObjId && !state.scene.objects[state.selectedObjId]) {
          state.selectedObjId = null;
        }
      });
    },

    redo: () => {
      set((state) => {
        const next = state.future.shift();
        if (!next) return;
        state.past.push(current(state.scene));
        // Same rule as undo: preserve the live camera across restores.
        const liveCamera = current(state.scene.camera);
        state.scene = next;
        state.scene.camera = liveCamera;
        if (state.selectedObjId && !state.scene.objects[state.selectedObjId]) {
          state.selectedObjId = null;
        }
      });
    },

    createObjectOfType: (type, opts) => {
      const store = get();
      const layerExists = store.scene.layers.some((l) => l.id === store.activeLayerId);
      const layerId = layerExists ? store.activeLayerId : DEFAULT_LAYER_ID;
      const id = createId(type);
      store.transaction((scene) => {
        scene.objects[id] = createSceneObject(type, {
          id,
          layerId,
          assetId: opts?.assetId,
          x: opts?.x,
          y: opts?.y,
          length: opts?.length,
          color: opts?.color,
        });
      });
      return id;
    },

    addObject: (obj) => {
      set((state) => {
        pushHistory(state);
        state.scene.objects[obj.id] = obj;
      });
    },

    updateTransform: (id, partial) => {
      // No snapshot: this is called within a begin/endInteraction edit session.
      set((state) => {
        const obj = state.scene.objects[id];
        if (!obj) return;
        obj.transform = mergeTransform(obj.transform, partial);
      });
    },

    moveObjectBy: (id, dx, dy) => {
      // No snapshot: used inside a begin/endInteraction drag.
      set((state) => {
        const obj = state.scene.objects[id];
        if (!obj) return;
        obj.transform = mergeTransform(obj.transform, {
          x: obj.transform.x + dx,
          y: obj.transform.y + dy,
        });
      });
    },

    addKeyframe: (objId, keyframe) => {
      set((state) => {
        pushHistory(state);
        const list = state.scene.keyframes[objId] ?? (state.scene.keyframes[objId] = []);
        const kf = { time: keyframe.time, transform: { ...keyframe.transform } };
        const idx = list.findIndex((k) => k.time === keyframe.time);
        if (idx >= 0) list[idx] = kf;
        else {
          list.push(kf);
          list.sort((a, b) => a.time - b.time);
        }
      });
    },

    setKeyframeAtTime: (objId, time) => {
      set((state) => {
        const obj = state.scene.objects[objId];
        if (!obj) return;
        pushHistory(state);
        const list = state.scene.keyframes[objId] ?? (state.scene.keyframes[objId] = []);
        const kf = { time, transform: { ...obj.transform } };
        const idx = list.findIndex((k) => k.time === time);
        if (idx >= 0) list[idx] = kf;
        else {
          list.push(kf);
          list.sort((a, b) => a.time - b.time);
        }
      });
    },

    updateKeyframe: (objId, time, patch) => {
      set((state) => {
        const list = state.scene.keyframes[objId];
        if (!list) return;
        const idx = list.findIndex((k) => k.time === time);
        if (idx < 0) return;
        pushHistory(state);
        const k = list[idx];
        if (patch.transform) k.transform = mergeTransform(k.transform, patch.transform);
        if (patch.time !== undefined && patch.time !== k.time) {
          const target = patch.time;
          // Identity invariant: a keyframe's `time` is unique within its object.
          // Moving onto an occupied time REPLACES the occupant — same
          // replace-at-same-time semantics as addKeyframe.
          const collision = list.findIndex((o) => o !== k && o.time === target);
          if (collision >= 0) list.splice(collision, 1);
          k.time = target;
          list.sort((a, b) => a.time - b.time);
        }
      });
    },

    removeKeyframe: (objId, time) => {
      set((state) => {
        const list = state.scene.keyframes[objId];
        if (!list) return;
        const idx = list.findIndex((k) => k.time === time);
        if (idx < 0) return;
        pushHistory(state);
        list.splice(idx, 1);
        if (list.length === 0) delete state.scene.keyframes[objId];
      });
    },

    addLayer: (name) => {
      set((state) => {
        pushHistory(state);
        const maxOrder = state.scene.layers.reduce((m, l) => Math.max(m, l.order), -1);
        state.scene.layers.push({
          id: createId('layer'),
          name,
          visible: true,
          order: state.scene.layers.length ? maxOrder + 1 : 0,
        });
      });
    },

    renameLayer: (id, name) => {
      set((state) => {
        const layer = state.scene.layers.find((l) => l.id === id);
        if (!layer) return;
        pushHistory(state);
        layer.name = name;
      });
    },

    toggleLayerVisible: (id) => {
      set((state) => {
        const layer = state.scene.layers.find((l) => l.id === id);
        if (!layer) return;
        pushHistory(state);
        layer.visible = !layer.visible;
      });
    },

    reorderLayers: (id, direction) => {
      set((state) => {
        const sorted = [...state.scene.layers].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((l) => l.id === id);
        if (idx === -1) return;
        const swapWith = direction === 'up' ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= sorted.length) return;
        const layer = sorted[idx];
        const other = sorted[swapWith];
        pushHistory(state);
        const tmp = layer.order;
        layer.order = other.order;
        other.order = tmp;
      });
    },

    removeLayer: (id) => {
      set((state) => {
        // Forbid deleting the last remaining layer.
        if (state.scene.layers.length <= 1) return;
        const layer = state.scene.layers.find((l) => l.id === id);
        if (!layer) return;
        pushHistory(state);
        // Reassignment target must be a SURVIVING layer (PRD §8: no object may
        // ever reference a deleted layer). Prefer DEFAULT_LAYER_ID when it
        // survives; otherwise the first remaining layer by draw order.
        const survivors = state.scene.layers.filter((l) => l.id !== id);
        const fallback =
          survivors.find((l) => l.id === DEFAULT_LAYER_ID) ??
          [...survivors].sort((a, b) => a.order - b.order)[0];
        for (const obj of Object.values(state.scene.objects)) {
          if (obj.layerId === id) obj.layerId = fallback.id;
        }
        state.scene.layers = survivors;
        // Keep activeLayerId pointing at a surviving layer.
        if (state.activeLayerId === id) state.activeLayerId = fallback.id;
      });
    },

    setSelected: (id) => {
      // Selection is store-root state: not undoable, not part of Scene.
      set((state) => {
        state.selectedObjId = id;
      });
    },

    setActiveLayer: (id) => {
      set((state) => {
        state.activeLayerId = id;
      });
    },

    updateCamera: (updater) => {
      set((state) => {
        state.scene.camera = updater(state.scene.camera);
      });
    },

    registerAsset: (asset) => {
      set((state) => {
        // Additive insert only. UUID uniqueness makes this a no-overwrite write.
        state.scene.assets[asset.id] = asset;
      });
    },

    importMap: async (file, opts) => {
      const asset = await importMapAsset(file, opts);
      set((state) => {
        // Undoable: importing a map reinterprets every existing world
        // coordinate against a new basis, so the previous state must stay
        // recoverable (never make irreversible scene changes).
        pushHistory(state);
        state.scene.assets[asset.id] = asset;
        state.scene.mapAssetId = asset.id;
        state.scene.worldSize = { w: asset.width, h: asset.height };
      });
    },
  }))
);
