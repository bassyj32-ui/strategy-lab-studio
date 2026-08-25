import { create } from 'zustand';
import type { ObjId } from '../scene/types';

/**
 * Solo-edit mode for the CapCut drag law (editor-only, never serialized):
 * double-click a group member to "enter" its group — members then drag
 * INDIVIDUALLY. Clicking the empty canvas exits back to group-level drags.
 */
interface SoloEditState {
  /** Group ROOT currently opened for solo member editing. */
  rootId: ObjId | null;
  enter: (rootId: ObjId) => void;
  exit: () => void;
}

export const useSoloEditStore = create<SoloEditState>((set) => ({
  rootId: null,
  enter: (rootId) => set({ rootId }),
  exit: () => set({ rootId: null }),
}));
