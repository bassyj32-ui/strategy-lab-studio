import { create } from 'zustand';
import type { ObjId } from '../scene/types';
import { useSceneStore } from '../scene/store';

export interface TimelineSelectionState {
  selectedObjId: ObjId | null;
  selectedKeyframeTime: number | null;
  selectObject: (id: ObjId | null) => void;
  selectKeyframe: (time: number | null) => void;
}

/**
 * Timeline-local UI selection (which object/keyframe is being edited).
 * This is NOT scene data and is never saved/rendered.
 */
export const useTimelineSelection = create<TimelineSelectionState>((set) => ({
  selectedObjId: null,
  selectedKeyframeTime: null,
  selectObject: (id) => set({ selectedObjId: id, selectedKeyframeTime: null }),
  selectKeyframe: (time) => set({ selectedKeyframeTime: time }),
}));

// ---------------------------------------------------------------------------
// Unified selection
//
// Historically there were two disconnected selection systems:
//   1. scene store `selectedObjId`  -> canvas highlight + Inspector
//   2. timeline selection store     -> KeyframeEditor + KeyframeTrack
// Everything that selects an object must now go through the helpers below so
// both stores always agree. The SCENE store stays the single source of truth
// for "which object is selected" (PRD §65/§99); the timeline store mirrors it
// and additionally tracks the selected keyframe.
// ---------------------------------------------------------------------------

/**
 * Select an object EVERYWHERE (canvas outline, Inspector, timeline track,
 * KeyframeEditor). Pass `null` to deselect everywhere.
 */
export function selectObjectUnified(id: ObjId | null): void {
  // Scene store first: it is authoritative, and the mirror below keeps the
  // timeline store in sync even when this helper is not the caller.
  useSceneStore.getState().setSelected(id);
  useTimelineSelection.getState().selectObject(id);
}

/**
 * Select a keyframe on `objId` everywhere: the object becomes selected in
 * both stores AND the keyframe at `time` becomes the active keyframe.
 * Pass `time = null` to keep the object selected but drop keyframe focus.
 */
export function selectKeyframeUnified(objId: ObjId, time: number | null): void {
  selectObjectUnified(objId);
  if (time !== null) useTimelineSelection.getState().selectKeyframe(time);
}

/**
 * One-way mirror: any change to the scene store's `selectedObjId` — from ANY
 * writer, including ones outside our control (canvas background deselect,
 * drag-drop placement, undo/redo cleanup) — is propagated into the timeline
 * selection store. This guarantees the two stores can never disagree, without
 * needing to touch every call site.
 */
let syncStarted = false;
export function initSelectionSync(): void {
  if (syncStarted) return;
  syncStarted = true;
  useSceneStore.subscribe((state, prev) => {
    const next = state.selectedObjId;
    if (next === prev.selectedObjId) return;
    const timeline = useTimelineSelection.getState();
    if (timeline.selectedObjId !== next) {
      // Reuse the store action so keyframe focus resets with the object.
      timeline.selectObject(next);
    }
  });
}
// Self-initialize: importing this module wires the mirror exactly once, so
// consumers never have to remember to call initSelectionSync themselves.
initSelectionSync();
