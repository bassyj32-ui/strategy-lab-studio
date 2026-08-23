// Regression tests for UNIFIED SELECTION (scene store ⇄ timeline store).
//
// Bugs covered:
//  - Bug 2 (canvas side): selecting on the canvas updated only the scene
//    store; the timeline/KeyframeEditor never heard about it. The unified
//    helpers + the scene→timeline mirror must keep both stores in agreement
//    no matter which writer fires.
import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from '../scene/store';
import { createDefaultScene } from '../scene/factory';
import { selectObjectUnified, selectKeyframeUnified, useTimelineSelection } from './selection';

const s = () => useSceneStore.getState();
const t = () => useTimelineSelection.getState();

beforeEach(() => {
  useSceneStore.setState({
    scene: createDefaultScene(),
    past: [],
    future: [],
    selectedObjId: null,
  });
  useTimelineSelection.setState({ selectedObjId: null, selectedKeyframeTime: null });
});

describe('unified selection', () => {
  it('selectObjectUnified updates BOTH stores; deselect clears BOTH', () => {
    const id = s().createObjectOfType('shape');

    selectObjectUnified(id);
    expect(s().selectedObjId).toBe(id); // Inspector + canvas outline
    expect(t().selectedObjId).toBe(id); // KeyframeEditor + track highlight

    selectObjectUnified(null);
    expect(s().selectedObjId).toBeNull();
    expect(t().selectedObjId).toBeNull();
  });

  it('MIRROR: raw scene-store writes propagate to the timeline store', () => {
    const id = s().createObjectOfType('marker');
    // CanvasStage drag-drop does exactly this (forbidden file): scene-only write.
    s().setSelected(id);
    expect(t().selectedObjId).toBe(id);

    // CanvasStage empty-canvas click deselects exactly this way.
    s().setSelected(null);
    expect(t().selectedObjId).toBeNull();
    expect(t().selectedKeyframeTime).toBeNull();
  });

  it('MIRROR: undo clearing a vanished selection propagates too', () => {
    const id = s().createObjectOfType('shape');
    selectObjectUnified(id);
    // undo() clears selectedObjId internally when its object disappears;
    // emulate that internal write path:
    useSceneStore.setState({ selectedObjId: null });
    expect(t().selectedObjId).toBeNull();
  });

  it('selectKeyframeUnified focuses a keyframe while selecting everywhere', () => {
    const id = s().createObjectOfType('shape');
    s().setKeyframeAtTime(id, 3);

    selectKeyframeUnified(id, 3);
    expect(s().selectedObjId).toBe(id);
    expect(t().selectedObjId).toBe(id);
    expect(t().selectedKeyframeTime).toBe(3);

    // Switching objects drops stale keyframe focus.
    const other = s().createObjectOfType('marker');
    selectObjectUnified(other);
    expect(t().selectedKeyframeTime).toBeNull();
    expect(s().selectedObjId).toBe(other);
  });
});
