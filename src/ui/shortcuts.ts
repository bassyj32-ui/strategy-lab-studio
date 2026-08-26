import { useSceneStore } from '../scene/store';

/**
 * UX repair pass: global editor keyboard shortcuts.
 *
 *   ⌘/Ctrl+D            duplicate the selected object (full keyframe copy)
 *   ⌘/Ctrl+G             group the current multi-selection
 *   ⌘/Ctrl+Shift+G       ungroup the selected object's parent group
 *   Delete / Backspace   remove the selected object (undoable)
 *
 * Shortcuts NEVER fire while the user is typing in an input, textarea,
 * select or contentEditable element. Every action routes through existing
 * store actions, so each one stays a single undoable transaction.
 */

/** True when the event originated inside a text-entry surface. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  );
}

/**
 * Handle one keydown. Returns true when the shortcut consumed the event
 * (callers can use this to decide whether to preventDefault themselves;
 * this function already calls preventDefault on handled events).
 */
export function handleEditorShortcut(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
}): boolean {
  if (isTypingTarget(e.target)) return false;
  const mod = e.metaKey || e.ctrlKey;
  const s = useSceneStore.getState();

  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    s.undo();
    return true;
  }

  if (mod && e.key.toLowerCase() === 'z' && e.shiftKey) {
    e.preventDefault();
    s.redo();
    return true;
  }

  if (mod && !e.shiftKey && e.key.toLowerCase() === 'd') {
    if (!s.selectedObjId) return false;
    e.preventDefault();
    s.duplicateObject(s.selectedObjId);
    return true;
  }

  if (mod && e.key.toLowerCase() === 'g') {
    if (e.shiftKey) {
      // Ungroup relative to the selected object: if it IS a group (either an
      // organizational 'group' node or a unit that parents others), dissolve
      // IT; otherwise dissolve the group it belongs to.
      const obj = s.selectedObjId ? s.scene.objects[s.selectedObjId] : null;
      if (!obj) return false;
      const hasChildren = Object.values(s.scene.objects).some(
        (o) => o.parentId === obj.id
      );
      const groupId =
        obj.type === 'group' || hasChildren ? obj.id : obj.parentId ?? null;
      if (!groupId) return false;
      e.preventDefault();
      s.ungroupObject(groupId);
      return true;
    }
    if (s.selectedIds.length < 2) return false;
    e.preventDefault();
    s.groupObject(s.selectedIds);
    return true;
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedObjId) {
    e.preventDefault();
    s.removeObject(s.selectedObjId);
    return true;
  }

  return false;
}
