import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current, type Draft } from 'immer';
import type {
  Asset,
  AssetId,
  CameraState,
  ControlPoint,
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
import {
  createScene,
  deleteScene as deleteSceneOp,
  duplicateScene,
  loadProject,
  serializeProject,
} from './sceneSystem';
import type { Project } from './types';
import { createSceneObject } from '../objects/factory';
import {
  canReparent,
  composeTransform,
  formationOffsets,
  resolveWorldTransform,
  selectionRoots,
  worldDeltaToLocal,
  worldPointToLocal,
  directChildren,
} from '../objects/groups';
import type {
  FormationPattern,
} from './types';
import type { ImportMapOptions } from '../assets/types';
import { importMapAsset } from '../assets/import';

const MAX_HISTORY = 100;

/**
 * Canvas tool (store-root UI state, never undoable). `select` is the default
 * pan/select behaviour; `arrow` turns background drags into arrow drawing.
 */
export type EditorTool = 'select' | 'arrow';

/**
 * One undo step = the WHOLE project at that moment (active scene + every
 * inactive scene + which one was active). Scene switching/duplication must be
 * undoable too, so a bare Scene snapshot is no longer enough.
 */
interface HistoryEntry {
  scene: Scene;
  inactiveScenes: Record<string, Scene>;
  activeSceneId: string;
}

function snapshotEntry(state: Draft<SceneState>): HistoryEntry {
  return {
    scene: current(state.scene),
    inactiveScenes: current(state.inactiveScenes),
    activeSceneId: state.activeSceneId,
  };
}

/** Push a deep project snapshot onto `past` and clear `future`. */
function pushHistory(state: Draft<SceneState>) {
  state.past.push(snapshotEntry(state));
  if (state.past.length > MAX_HISTORY) state.past.shift();
  state.future = [];
}

/** Structural equality used to drop no-op undo entries on `endInteraction`. */
function scenesEqual(a: Scene, b: Scene): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Re-parent `childId` under `newParentId` (or root), converting its transform
 * so its WORLD position/rotation/scale/opacity stay EXACTLY where they were.
 * Pure scene mutation — callers own the history snapshot.
 */
function attachUnderParent(
  scene: Scene,
  childId: ObjId,
  newParentId: ObjId | null
): void {
  const obj = scene.objects[childId];
  if (!obj) return;
  // Draft<SceneObject> is structurally the plain type at runtime; groups.ts
  // only reads, so a cast here keeps the pure helpers draft-agnostic.
  const objects = scene.objects as unknown as Record<ObjId, SceneObject>;
  const IDENTITY: Transform = {
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    opacity: 1,
  };
  // Read everything BEFORE mutating obj.
  const oldParentWorld = obj.parentId
    ? resolveWorldTransform(objects, obj.parentId)
    : IDENTITY;
  const world = resolveWorldTransform(objects, childId);
  const pw = newParentId ? resolveWorldTransform(objects, newParentId) : IDENTITY;
  const s = pw.scale !== 0 ? pw.scale : 1;
  const o = pw.opacity !== 0 ? pw.opacity : 1;

  if (newParentId) {
    const p = worldPointToLocal(pw, world.x, world.y);
    obj.transform = {
      x: p.x,
      y: p.y,
      rotation: world.rotation - pw.rotation,
      scale: world.scale / s,
      opacity: world.opacity / o,
    };
    obj.parentId = newParentId;
  } else {
    // Root: local == world.
    obj.transform = {
      x: world.x,
      y: world.y,
      rotation: world.rotation,
      scale: world.scale,
      opacity: world.opacity,
    };
    delete obj.parentId;
  }

  // Re-base keyframes: a child's keyframes are stored in its OLD parent's
  // local frame. Convert each through world space into the NEW parent's local
  // frame so the animation stays put when re-parented (otherwise world
  // keyframes get reinterpreted as local and the object jumps).
  const kfs = scene.keyframes[childId];
  if (kfs) {
    for (const kf of kfs) {
      const kw = composeTransform(oldParentWorld, kf.transform);
      const lp = worldPointToLocal(pw, kw.x, kw.y);
      kf.transform = {
        x: lp.x,
        y: lp.y,
        rotation: kw.rotation - pw.rotation,
        scale: kw.scale / s,
        opacity: kw.opacity / o,
      };
    }
  }
}

/** Move one object by a WORLD delta, converting it into its parent's frame. */
function applyWorldDelta(scene: Scene, id: ObjId, dxw: number, dyw: number): void {
  const obj = scene.objects[id];
  if (!obj) return;
  const objects = scene.objects as unknown as Record<ObjId, SceneObject>;
  const d =
    obj.parentId && objects[obj.parentId]
      ? worldDeltaToLocal(resolveWorldTransform(objects, obj.parentId), dxw, dyw)
      : { x: dxw, y: dyw };
  obj.transform.x += d.x;
  obj.transform.y += d.y;
}

/** After any scene swap, keep store-root pointers valid (never undoable). */
function revalidateStoreRoot(state: Draft<SceneState>) {
  // Selection lives outside the Scene; clear it if its object vanished.
  if (state.selectedObjId && !state.scene.objects[state.selectedObjId]) {
    state.selectedObjId = null;
  }
  // Active layer must exist in the ACTIVE scene.
  if (!state.scene.layers.some((l) => l.id === state.activeLayerId)) {
    state.activeLayerId =
      state.scene.layers.find((l) => l.id === DEFAULT_LAYER_ID)?.id ??
      state.scene.layers[0]?.id ??
      DEFAULT_LAYER_ID;
  }
}

export interface SceneState {
  /** Single source of truth for editor + (future) render — the ACTIVE scene. */
  scene: Scene;
  /** Every NON-active scene of the open project, keyed by id. */
  inactiveScenes: Record<string, Scene>;
  /** Id of the active scene (always === `scene.id`). */
  activeSceneId: string;
  /** Undo / redo stacks of full PROJECT snapshots. */
  past: HistoryEntry[];
  future: HistoryEntry[];

  // ---- Selection / active layer: STORE-ROOT, excluded from Scene + undo ----
  /** PRIMARY (last-clicked) selection — kept in sync for existing consumers. */
  selectedObjId: ObjId | null;
  /**
   * FULL multi-selection (P1 groups pull-forward), primary LAST. Always
   * consistent with `selectedObjId` (which is its final element or null).
   */
  selectedIds: ObjId[];
  activeLayerId: LayerId;
  activeTool: EditorTool;

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
      /** DEGREES (object-transform convention). */
      rotation?: number;
      /** ARROW-ONLY. */
      length?: number;
      /** ARROW-ONLY. */
      color?: string;
    }
  ) => ObjId;
  addObject: (obj: SceneObject) => void;
  updateTransform: (id: ObjId, partial: Partial<Transform>) => void;
  /**
   * Patch non-transform object props (ARROW length/color today). No snapshot:
   * call within a begin/endInteraction edit session (Inspector fields do).
   */
  updateObjectProps: (
    id: ObjId,
    props: Partial<Pick<SceneObject, 'length' | 'color'>>
  ) => void;
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
  /**
   * Set/clear a bezier control point on the keyframe at `time`.
   * `which='cpOut'` shapes the segment STARTING here; `'cpIn'` the one
   * ENDING here; `null` clears (back to linear). SESSION CONTRACT exactly like
   * `updateTransform`: NO snapshot — wrap a handle drag in
   * beginInteraction/endInteraction for ONE undoable gesture, or call inside
   * `transaction` for a discrete undoable set/clear.
   */
  setKeyframeCp: (
    objId: ObjId,
    time: number,
    which: 'cpIn' | 'cpOut',
    cp: ControlPoint | null
  ) => void;

  // ---- Layers ----
  addLayer: (name: string) => void;
  renameLayer: (id: LayerId, name: string) => void;
  toggleLayerVisible: (id: LayerId) => void;
  reorderLayers: (id: LayerId, direction: 'up' | 'down') => void;
  removeLayer: (id: LayerId) => void;

  // ---- Multi-scene project (Scenes panel) ----
  /** Create an empty scene and switch to it. One undoable transaction. */
  addScene: (name?: string) => void;
  /** Deep-copy the active scene (new object/layer ids) and switch to it. */
  duplicateActiveScene: () => void;
  /** Delete a scene by id; deleting the LAST scene is a no-op (forbidden). */
  removeScene: (id: string) => void;
  /** Stash the active scene and make `id` active. No-op on unknown id. */
  switchScene: (id: string) => void;
  renameScene: (id: string, name: string) => void;
  /** Versioned full-project save payload (LAW: save the WHOLE project). */
  getProject: () => Project;
  /**
   * Parse + validate + REPLACE the whole open project. Throws on invalid
   * input (caller surfaces it); a successful load is one undoable step.
   */
  loadProjectFromJson: (json: string) => void;

    // ---- Selection / active layer (store-root, never undoable) ----
    setSelected: (id: ObjId | null) => void;
    /** Replace the whole multi-selection (primary = last element). */
    setSelectedIds: (ids: ObjId[]) => void;
    /** Shift-click semantics: add/remove one id from the multi-selection. */
    toggleSelected: (id: ObjId) => void;
    setActiveLayer: (id: LayerId) => void;
    setTool: (tool: EditorTool) => void;

    // ---- Groups / formations (P1 pull-forward, ONE undoable transaction each) ----
    /**
     * Group `ids` under a single parent (the first id that can lawfully parent
     * all others). Children keep their WORLD pose — transforms are converted
     * to the parent's local frame. Returns the parent id, or null on invalid
     * input / impossible hierarchy.
     */
    groupObject: (ids: ObjId[]) => ObjId | null;
    /**
     * Dissolve the group under `parentId`: children re-parent to the parent's
     * own parent (or root), keeping world pose. An organizational 'group'
     * parent is removed; ordinary objects survive as plain members.
     */
    ungroupObject: (parentId: ObjId) => void;
    /**
     * Spawn a formation: one 'group' parent plus N pattern-placed children in
     * ONE undoable transaction (undo collapses the whole formation).
     */
    createFormation: (
      pattern: FormationPattern,
      opts?: {
        count?: number;
        spacing?: number;
        x?: number;
        y?: number;
        childType?: SceneObjectType;
      }
    ) => { groupId: ObjId; childIds: ObjId[] };
    /** Move a group parent by a WORLD delta — children track automatically. */
    moveGroup: (groupId: ObjId, dx: number, dy: number) => void;
    /**
     * Remove one object. Its children are RE-PARENTED to its parent (or
     * root), never orphaned or deleted (PRD §3/§8). Undoable.
     */
    removeObject: (id: ObjId) => void;
    /**
     * Gesture helper (no snapshot): move several SELECTION ROOTS by one WORLD
     * delta. Each object's delta is converted into its own parent frame.
     */
    moveObjectsBy: (ids: ObjId[], dx: number, dy: number) => void;

    // ---- Camera (single source of truth: Scene.camera, PRD §87) ----
    /** Writes a NEW camera state derived by `updater`; never mutates in place. */
    updateCamera: (updater: (cam: CameraState) => CameraState) => void;

    // ---- Camera track (per-scene animated camera; see cameraTrack.ts) ----
    /**
     * Keys the CURRENT live view (`scene.camera`) at `time`, replacing any
     * keyframe already at that time. One undo step.
     */
    setCameraKeyframe: (time: number) => void;
    /** Removes the keyframe at `time` if present. One undo step. */
    removeCameraKeyframe: (time: number) => void;
    /**
     * Moves a keyframe to a new time; landing on an occupied time REPLACES
     * the occupant (same semantics as updateKeyframe). No-op when `fromTime`
     * has no keyframe. One undo step.
     */
    moveCameraKeyframe: (fromTime: number, toTime: number) => void;

    // ---- Asset / map registry writes ----
    /** Insert-only asset registry write (additive, never overwrites). */
    registerAsset: (asset: Asset) => void;
    /** Imports a map file, registers it, points mapAssetId + worldSize at it. */
    importMap: (file: File, opts?: ImportMapOptions) => Promise<void>;
  }

export const useSceneStore = create<SceneState>()(
  immer((set, get) => ({
    scene: createDefaultScene(),
    inactiveScenes: {},
    activeSceneId: 'scene-0',
    past: [],
    future: [],
  selectedObjId: null,
  selectedIds: [],
  activeLayerId: DEFAULT_LAYER_ID,
  activeTool: 'select',

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
        const last = state.past[state.past.length - 1]?.scene;
        if (last && scenesEqual(last, state.scene)) {
          state.past.pop();
        }
      });
    },

    undo: () => {
      set((state) => {
        const prev = state.past.pop();
        if (!prev) return;
        state.future.unshift(snapshotEntry(state));
        // Camera is NAVIGATION state, not undoable content — but ONLY within
        // the SAME scene (PRD §87: the camera lives in per-map world space).
        // If the restore activates a DIFFERENT scene, keep that scene's own
        // saved camera; injecting this scene's view would corrupt it.
        const sameScene = prev.activeSceneId === state.activeSceneId;
        const liveCamera = sameScene ? current(state.scene.camera) : null;
        state.scene = prev.scene;
        if (liveCamera) state.scene.camera = liveCamera;
        state.inactiveScenes = prev.inactiveScenes;
        state.activeSceneId = prev.activeSceneId;
        // CONTRACT: undo/redo never touch selectedIds/activeLayerId — only
        // clear selections whose objects no longer exist (both id forms).
        if (state.selectedObjId && !state.scene.objects[state.selectedObjId]) {
          state.selectedObjId = null;
        }
        state.selectedIds = state.selectedIds.filter(
          (id) => state.scene.objects[id]
        );
      });
    },

    redo: () => {
      set((state) => {
        const next = state.future.shift();
        if (!next) return;
        state.past.push(snapshotEntry(state));
        // Same rule as undo (see above).
        const sameScene = next.activeSceneId === state.activeSceneId;
        const liveCamera = sameScene ? current(state.scene.camera) : null;
        state.scene = next.scene;
        if (liveCamera) state.scene.camera = liveCamera;
        state.inactiveScenes = next.inactiveScenes;
        state.activeSceneId = next.activeSceneId;
        if (state.selectedObjId && !state.scene.objects[state.selectedObjId]) {
          state.selectedObjId = null;
        }
        state.selectedIds = state.selectedIds.filter(
          (id) => state.scene.objects[id]
        );
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
          rotation: opts?.rotation,
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

    updateObjectProps: (id, props) => {
      // No snapshot: same coalesced-session contract as updateTransform.
      set((state) => {
        const obj = state.scene.objects[id];
        if (!obj) return;
        if (props.length !== undefined) obj.length = props.length;
        if (props.color !== undefined) obj.color = props.color;
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

    setKeyframeCp: (objId, time, which, cp) => {
      // No snapshot: session contract (see interface doc). Callers provide the
      // undo boundary via begin/endInteraction or transaction.
      set((state) => {
        const list = state.scene.keyframes[objId];
        if (!list) return;
        const k = list.find((o) => o.time === time);
        if (!k) return;
        if (cp === null) delete k[which];
        else k[which] = { dx: cp.dx, dy: cp.dy };
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

    addScene: (name) => {
      set((state) => {
        pushHistory(state);
        // Stash the outgoing scene first — no scene is ever lost.
        state.inactiveScenes[state.activeSceneId] = current(state.scene);
        const next = createScene(name ? { name } : {});
        state.scene = next;
        state.activeSceneId = next.id;
        revalidateStoreRoot(state);
      });
    },

    duplicateActiveScene: () => {
      set((state) => {
        pushHistory(state);
        state.inactiveScenes[state.activeSceneId] = current(state.scene);
        const copy = duplicateScene(current(state.scene));
        state.scene = copy;
        state.activeSceneId = copy.id;
        revalidateStoreRoot(state);
      });
    },

    removeScene: (id) => {
      set((state) => {
        const total = Object.keys(state.inactiveScenes).length + 1;
        if (total <= 1) return; // LAW: never allow zero scenes
        // Plain snapshots so the pure op can decide the survivor safely.
        const all: Scene[] = [
          current(state.scene),
          ...Object.values(current(state.inactiveScenes)),
        ];
        let result: ReturnType<typeof deleteSceneOp>;
        try {
          result = deleteSceneOp(all, state.activeSceneId, id);
        } catch (e) {
          // Unknown id → silent no-op, no history pollution. Any OTHER error
          // is a real bug and must not be swallowed.
          const msg = e instanceof Error ? e.message : String(e);
          if (!/Unknown scene/.test(msg)) throw e;
          return;
        }
        pushHistory(state);
        const byId = new Map(result.scenes.map((s) => [s.id, s]));
        const active = byId.get(result.activeSceneId)!;
        byId.delete(result.activeSceneId);
        state.scene = active;
        state.activeSceneId = result.activeSceneId;
        state.inactiveScenes = Object.fromEntries(byId);
        revalidateStoreRoot(state);
      });
    },

    switchScene: (id) => {
      set((state) => {
        if (id === state.activeSceneId) return;
        const next = current(state.inactiveScenes[id]);
        if (!next) return;
        pushHistory(state);
        state.inactiveScenes[state.activeSceneId] = current(state.scene);
        delete state.inactiveScenes[id];
        state.scene = next;
        state.activeSceneId = id;
        revalidateStoreRoot(state);
      });
    },

    renameScene: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      set((state) => {
        if (state.activeSceneId !== id && !state.inactiveScenes[id]) return;
        pushHistory(state);
        if (state.activeSceneId === id) state.scene.name = trimmed;
        else state.inactiveScenes[id].name = trimmed;
      });
    },

    getProject: () => {
      const s = get();
      return serializeProject(
        [s.scene, ...Object.values(s.inactiveScenes)],
        s.activeSceneId
      );
    },

    loadProjectFromJson: (json) => {
      // Validate BEFORE touching state: a rejected file must change nothing.
      // The raw string goes straight to the validator so malformed JSON gets
      // the normalized "Invalid project file: …" error, not a raw SyntaxError.
      const project = loadProject(json);
      set((state) => {
        pushHistory(state);
        const byId = new Map(project.scenes.map((s) => [s.id, s]));
        const active = byId.get(project.activeSceneId)!;
        byId.delete(project.activeSceneId);
        state.scene = active;
        state.activeSceneId = project.activeSceneId;
        state.inactiveScenes = Object.fromEntries(byId);
        revalidateStoreRoot(state);
      });
    },

    setSelected: (id) => {
      // Selection is store-root state: not undoable, not part of Scene.
      set((state) => {
        state.selectedObjId = id;
        // Keep multi-selection consistent: primary-only selection.
        state.selectedIds = id ? [id] : [];
      });
    },

    setSelectedIds: (ids) => {
      set((state) => {
        state.selectedIds = ids;
        state.selectedObjId = ids.length > 0 ? ids[ids.length - 1] : null;
      });
    },

    toggleSelected: (id) => {
      set((state) => {
        const has = state.selectedIds.includes(id);
        state.selectedIds = has
          ? state.selectedIds.filter((x) => x !== id)
          : [...state.selectedIds, id];
        state.selectedObjId =
          state.selectedIds.length > 0
            ? state.selectedIds[state.selectedIds.length - 1]
            : null;
      });
    },

    groupObject: (ids) => {
      if (ids.length < 2) return null;
      const objects = get().scene.objects;
      if (ids.some((id) => !objects[id])) return null;
      // The first candidate that can lawfully parent ALL the others.
      const parent =
        ids.find(
          (cand) =>
            ids.every((other) => other === cand || canReparent(objects, other, cand))
        ) ?? null;
      if (!parent) return null;
      set((state) => {
        pushHistory(state);
        for (const id of ids) {
          if (id !== parent) attachUnderParent(state.scene, id, parent);
        }
      });
      return parent;
    },

    ungroupObject: (parentId) => {
      set((state) => {
        const parent = state.scene.objects[parentId];
        if (!parent) return;
        const children = directChildren(
          state.scene.objects as unknown as Record<ObjId, SceneObject>,
          parentId
        );
        pushHistory(state);
        const grandparent = parent.parentId ?? null;
        for (const child of children) {
          attachUnderParent(state.scene, child.id, grandparent);
        }
        // An organizational 'group' node dissolves entirely; ordinary objects
        // merely lose their children and survive.
        if (parent.type === 'group') {
          delete state.scene.objects[parentId];
          delete state.scene.keyframes[parentId];
        }
      });
    },

    createFormation: (pattern, opts) => {
      const count = Math.max(1, Math.floor(opts?.count ?? 5));
      const spacing = Math.max(1, opts?.spacing ?? 50);
      let groupId: ObjId | null = null;
      let childIds: ObjId[] = [];
      set((state) => {
        pushHistory(state);
        const layerExists = state.scene.layers.some(
          (l) => l.id === state.activeLayerId
        );
        const layerId = layerExists ? state.activeLayerId : DEFAULT_LAYER_ID;
        groupId = createId('group');
        state.scene.objects[groupId] = createSceneObject('group', {
          id: groupId,
          layerId,
          x: opts?.x ?? state.scene.worldSize.w / 2,
          y: opts?.y ?? state.scene.worldSize.h / 2,
        });
        childIds = [];
        const childType = opts?.childType ?? 'unit';
        const ax = opts?.x ?? state.scene.worldSize.w / 2;
        const ay = opts?.y ?? state.scene.worldSize.h / 2;
        for (const off of formationOffsets(pattern, count, spacing)) {
          const cid = createId(childType);
          const child = createSceneObject(childType, {
            id: cid,
            layerId,
            x: ax + off.x,
            y: ay + off.y,
          });
          // Group is at identity rotation/scale → local offset == world offset.
          child.parentId = groupId;
          state.scene.objects[cid] = child;
          childIds.push(cid);
        }
      });
      return { groupId: groupId!, childIds };
    },

    moveGroup: (groupId, dx, dy) => {
      set((state) => {
        if (!state.scene.objects[groupId]) return;
        pushHistory(state);
        applyWorldDelta(state.scene, groupId, dx, dy);
      });
    },

    removeObject: (id) => {
      set((state) => {
        const obj = state.scene.objects[id];
        if (!obj) return;
        pushHistory(state);
        // Children are re-parented upward, never orphaned or deleted (PRD §8).
        const grandparent = obj.parentId ?? null;
        for (
          const child of directChildren(
            state.scene.objects as unknown as Record<ObjId, SceneObject>,
            id
          )
        ) {
          attachUnderParent(state.scene, child.id, grandparent);
        }
        delete state.scene.objects[id];
        delete state.scene.keyframes[id];
        if (state.selectedObjId === id) state.selectedObjId = null;
        state.selectedIds = state.selectedIds.filter((x) => x !== id);
      });
    },

    moveObjectsBy: (ids, dx, dy) => {
      // No snapshot: gesture helper — caller owns begin/endInteraction.
      set((state) => {
        const roots = selectionRoots(
          state.scene.objects as unknown as Record<ObjId, SceneObject>,
          ids
        );
        for (const root of roots) applyWorldDelta(state.scene, root, dx, dy);
      });
    },

    setActiveLayer: (id) => {
      set((state) => {
        state.activeLayerId = id;
      });
    },

    setTool: (tool) => {
      set((state) => {
        state.activeTool = tool;
      });
    },

    updateCamera: (updater) => {
      set((state) => {
        state.scene.camera = updater(state.scene.camera);
      });
    },

    setCameraKeyframe: (time) => {
      set((state) => {
        pushHistory(state);
        const cam = current(state.scene.camera);
        const kf = { time, cam: { x: cam.x, y: cam.y, zoom: cam.zoom } };
        const track = state.scene.cameraTrack ?? (state.scene.cameraTrack = []);
        const idx = track.findIndex((k) => k.time === time);
        if (idx >= 0) track[idx] = kf;
        else {
          track.push(kf);
          track.sort((a, b) => a.time - b.time);
        }
      });
    },

    removeCameraKeyframe: (time) => {
      set((state) => {
        const track = state.scene.cameraTrack;
        if (!track) return;
        const idx = track.findIndex((k) => k.time === time);
        if (idx < 0) return;
        pushHistory(state);
        track.splice(idx, 1);
        if (track.length === 0) delete state.scene.cameraTrack;
      });
    },

    moveCameraKeyframe: (fromTime, toTime) => {
      set((state) => {
        const track = state.scene.cameraTrack;
        if (!track || fromTime === toTime) return;
        const idx = track.findIndex((k) => k.time === fromTime);
        if (idx < 0) return;
        pushHistory(state);
        // Identity invariant: a keyframe's time is unique within the track.
        // Landing on an occupied time REPLACES the occupant. Grab the
        // keyframe FIRST — splicing an earlier collision would shift idx.
        const kf = track[idx];
        const collision = track.findIndex((k, i) => i !== idx && k.time === toTime);
        if (collision >= 0) track.splice(collision, 1);
        kf.time = toTime;
        track.sort((a, b) => a.time - b.time);
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
