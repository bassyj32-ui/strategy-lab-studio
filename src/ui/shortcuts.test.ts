import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleEditorShortcut,
  isTypingTarget,
} from './shortcuts';
import { useSceneStore } from '../scene/store';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';
import { usePlaybackStore } from '../timeline/playbackStore';

const s = () => useSceneStore.getState();

const reset = () => {
  useSceneStore.setState({
    scene: createDefaultScene(),
    past: [],
    future: [],
    selectedObjId: null,
    selectedIds: [],
    activeLayerId: DEFAULT_LAYER_ID,
  });
  s().setAutoKeyframe(false);
  usePlaybackStore.setState({ currentTime: 0 });
};

interface FakeEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  preventDefault: ReturnType<typeof vi.fn>;
}

const ev = (opts: Partial<FakeEvent>): FakeEvent => ({
  key: '',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  target: null,
  preventDefault: vi.fn(),
  ...opts,
});

describe('editor keyboard shortcuts (UX repair pass ④)', () => {
  beforeEach(reset);

  it('⌘/Ctrl+D duplicates the selected object', () => {
    const id = s().createObjectOfType('unit');
    s().setSelected(id);
    const countBefore = Object.keys(s().scene.objects).length;
    const e = ev({ key: 'd', metaKey: true });
    expect(handleEditorShortcut(e)).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(Object.keys(s().scene.objects).length).toBe(countBefore + 1);
    // The duplicate became the primary selection.
    expect(s().selectedObjId).not.toBe(id);
  });

  it('⌘G groups a multi-selection; ⌘⇧G ungroups it', () => {
    const a = s().createObjectOfType('unit');
    const b = s().createObjectOfType('unit');
    s().setSelectedIds([a, b]);
    expect(handleEditorShortcut(ev({ key: 'g', ctrlKey: true }))).toBe(true);
    // groupObject parents one candidate under the other (no synthetic node).
    // The group root is whichever object survived un-parented.
    const groupRoot =
      s().scene.objects[a].parentId ?? a;
    expect(s().scene.objects[b].parentId).not.toBeNull();

    // Select the group root and ungroup with ⌘⇧G.
    s().setSelected(groupRoot);
    expect(
      handleEditorShortcut(ev({ key: 'g', metaKey: true, shiftKey: true }))
    ).toBe(true);
    expect(s().scene.objects[a].parentId).toBeUndefined();
    expect(s().scene.objects[b].parentId).toBeUndefined();
  });

  it('Delete/Backspace removes the selected object (undoable)', () => {
    const id = s().createObjectOfType('unit');
    s().setSelected(id);
    expect(handleEditorShortcut(ev({ key: 'Backspace' }))).toBe(true);
    expect(s().scene.objects[id]).toBeUndefined();
    s().undo();
    expect(s().scene.objects[id]).toBeDefined();
  });

  it('ignores keys while typing in inputs and no-ops without selection', () => {
    const id = s().createObjectOfType('unit');
    s().setSelected(id);
    const input = { tagName: 'INPUT', isContentEditable: false };
    expect(
      handleEditorShortcut(ev({ key: 'Backspace', target: input as unknown as EventTarget }))
    ).toBe(false);
    expect(s().scene.objects[id]).toBeDefined();

    // Plain 'd' / 'g' without modifier: not handled.
    expect(handleEditorShortcut(ev({ key: 'd' }))).toBe(false);
    expect(handleEditorShortcut(ev({ key: 'g', metaKey: true }))).toBe(false); // <2 selected

    // Nothing selected: ⌘D / Delete do nothing.
    s().setSelected(null);
    expect(handleEditorShortcut(ev({ key: 'd', metaKey: true }))).toBe(false);
    expect(handleEditorShortcut(ev({ key: 'Delete' }))).toBe(false);
  });

  it('isTypingTarget covers the text-entry surfaces', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY' } as unknown as EventTarget)).toBe(
      false
    );
    expect(isTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(
      true
    );
    expect(
      isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)
    ).toBe(true);
  });
});
