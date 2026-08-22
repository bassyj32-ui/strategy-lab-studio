import { create } from 'zustand';
import type { ObjId } from '../scene/types';

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
