import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore, __resetInteractionForTests } from './store';
import { usePlaybackStore } from '../timeline/playbackStore';
import { createDefaultScene, DEFAULT_LAYER_ID } from './factory';

const s = () => useSceneStore.getState();

const reset = () => {
  __resetInteractionForTests();
  useSceneStore.setState({
    scene: createDefaultScene(),
    inactiveScenes: {},
    activeSceneId: 'scene-0',
    past: [],
    future: [],
    selectedObjId: null,
    selectedIds: [],
    activeLayerId: DEFAULT_LAYER_ID,
  });
  s().setAutoKeyframe(false);
  usePlaybackStore.setState({ currentTime: 0 });
};

const mkAnimated = (): string => {
  const id = s().createObjectOfType('shape');
  s().addKeyframe(id, {
    time: 0,
    transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
  });
  s().addKeyframe(id, {
    time: 10,
    transform: { x: 100, y: 0, rotation: 0, scale: 1, opacity: 1 },
  });
  return id;
};

describe('undo/redo hardening: session-contract writers', () => {
  beforeEach(reset);

  it('Inspector-style DIRECT updateTransform undoes in ONE step', () => {
    const id = s().createObjectOfType('shape');
    const before = s().past.length;
    // No begin/endInteraction — like a direct programmatic nudge.
    s().updateTransform(id, { x: 321 });
    expect(s().scene.objects[id].transform.x).toBe(321);
    expect(s().past.length).toBe(before + 1);
    s().undo();
    expect(s().scene.objects[id].transform.x).not.toBe(321);
    s().redo();
    expect(s().scene.objects[id].transform.x).toBe(321);
  });

  it('Inspector-style DIRECT updateObjectProps (depth chip) undoes in ONE step', () => {
    const id = s().createObjectOfType('shape');
    const before = s().past.length;
    s().updateObjectProps(id, { z: 5 });
    expect(s().scene.objects[id].z).toBe(5);
    expect(s().past.length).toBe(before + 1);
    s().undo();
    expect(s().scene.objects[id].z).toBeUndefined();
  });

  it('DIRECT moveObjectBy undoes in ONE step', () => {
    const id = s().createObjectOfType('shape');
    const x0 = s().scene.objects[id].transform.x;
    const before = s().past.length;
    s().moveObjectBy(id, 40, -7);
    expect(s().past.length).toBe(before + 1);
    s().undo();
    expect(s().scene.objects[id].transform.x).toBe(x0);
  });

  it('DIRECT moveObjectsBy undoes in ONE step', () => {
    const id = s().createObjectOfType('shape');
    const x0 = s().scene.objects[id].transform.x;
    const before = s().past.length;
    s().moveObjectsBy([id], 15, 15);
    expect(s().past.length).toBe(before + 1);
    s().undo();
    expect(s().scene.objects[id].transform.x).toBe(x0);
  });

  it('DIRECT moveGroup undoes in ONE step', () => {
    const parent = s().createObjectOfType('group');
    const x0 = s().scene.objects[parent].transform.x;
    const before = s().past.length;
    s().moveGroup(parent, 30, -10);
    expect(s().past.length).toBe(before + 1);
    s().undo();
    expect(s().scene.objects[parent].transform.x).toBe(x0);
  });

  it('DIRECT setKeyframeCp (discrete clear) undoes in ONE step', () => {
    const id = mkAnimated();
    s().setKeyframeCp(id, 0, 'cpOut', { dx: 10, dy: 10 });
    expect(s().scene.keyframes[id][0].cpOut).toEqual({ dx: 10, dy: 10 });
    const before = s().past.length;
    s().setKeyframeCp(id, 0, 'cpOut', null);
    expect(s().scene.keyframes[id][0].cpOut).toBeUndefined();
    expect(s().past.length).toBe(before + 1);
    s().undo();
    expect(s().scene.keyframes[id][0].cpOut).toEqual({ dx: 10, dy: 10 });
  });

  it('DIRECT setKeyframeTransform (waypoint nudge) undoes in ONE step', () => {
    const id = mkAnimated();
    const before = s().past.length;
    s().setKeyframeTransform(id, 0, { x: 77 });
    expect(s().scene.keyframes[id][0].transform.x).toBe(77);
    expect(s().past.length).toBe(before + 1);
    s().undo();
    expect(s().scene.keyframes[id][0].transform.x).toBe(0);
  });

  it('gesture coalescing still holds: N writes in ONE session = ONE entry', () => {
    const id = s().createObjectOfType('shape');
    const x0 = s().scene.objects[id].transform.x;
    const before = s().past.length;
    s().beginInteraction();
    for (let i = 0; i < 10; i++) s().moveObjectBy(id, 10, 0);
    s().endInteraction();
    expect(s().scene.objects[id].transform.x).toBe(x0 + 100);
    expect(s().past.length).toBe(before + 1);
    s().undo();
    // Whole drag reverts at once.
    expect(s().scene.objects[id].transform.x).toBe(x0);
  });

  it('moveGroup inside a gesture does NOT flood history (gizmo-drag regression)', () => {
    const parent = s().createObjectOfType('group');
    const x0 = s().scene.objects[parent].transform.x;
    const before = s().past.length;
    s().beginInteraction();
    for (let i = 0; i < 5; i++) s().moveGroup(parent, 4, 0);
    s().endInteraction();
    expect(s().scene.objects[parent].transform.x).toBe(x0 + 20);
    expect(s().past.length).toBe(before + 1);
    s().undo();
    // All five per-move deltas revert together.
    expect(s().scene.objects[parent].transform.x).toBe(x0);
  });

  it('no-op gesture grows NO history (empty session)', () => {
    s().createObjectOfType('shape');
    const before = s().past.length;
    s().beginInteraction();
    s().endInteraction();
    expect(s().past.length).toBe(before);
  });

  it('no-op drag grows NO history (zero-delta write)', () => {
    const id = s().createObjectOfType('shape');
    const before = s().past.length;
    s().beginInteraction();
    s().moveObjectBy(id, 0, 0);
    s().endInteraction();
    expect(s().past.length).toBe(before);
  });

  it('beginInteraction clears a stale auto-KF dirty set (no phantom keyframe)', () => {
    const id = s().createObjectOfType('shape');
    s().setAutoKeyframe(true);
    // Direct write while auto-KF is on marks the object dirty with no
    // endInteraction to flush it (the pre-fix leak).
    s().updateTransform(id, { x: 55 });
    // The NEXT gesture must start clean: no keyframe for the stale edit.
    s().beginInteraction();
    s().endInteraction();
    expect(s().scene.keyframes[id]).toBeUndefined();
    s().setAutoKeyframe(false);
  });

  it('auto-KF gesture still writes gesture + keyframe as ONE undo step', () => {
    const id = s().createObjectOfType('shape');
    s().setAutoKeyframe(true);
    usePlaybackStore.setState({ currentTime: 3 });
    const before = s().past.length;
    s().beginInteraction();
    s().moveObjectBy(id, 25, 0);
    s().endInteraction();
    expect(s().past.length).toBe(before + 1);
    expect(s().scene.keyframes[id]?.map((k) => k.time)).toContain(3);
    s().undo();
    expect(s().scene.keyframes[id]).toBeUndefined();
    s().setAutoKeyframe(false);
  });
});

describe('camera is navigation state: non-undoable, preserved by undo (PRD §87)', () => {
  beforeEach(reset);

  it('updateCamera pushes NO history', () => {
    const before = s().past.length;
    s().updateCamera((cam) => ({ ...cam, x: 111 }));
    expect(s().scene.camera.x).toBe(111);
    expect(s().past.length).toBe(before);
  });

  it('undo preserves the live camera while reverting content (same scene)', () => {
    const id = s().createObjectOfType('shape');
    s().updateCamera((cam) => ({ ...cam, x: 999, zoom: 2.5 }));
    const liveCamera = { ...s().scene.camera };
    const before = s().past.length;

    s().renameObject(id, 'renamed');
    expect(s().past.length).toBe(before + 1);

    s().undo();
    // Content reverts…
    expect(s().scene.objects[id].name).toBeUndefined();
    // …but the live camera survives (panning is not undoable content).
    expect(s().scene.camera).toEqual(liveCamera);
  });
});
