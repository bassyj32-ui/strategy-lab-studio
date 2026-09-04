import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from '../scene/store';
import { createDefaultScene } from '../scene/factory';
import type { Transform } from '../scene/types';
import {
  addKeyframe,
  setKeyframeAtTime,
  keyframeSelectionAtTime,
  updateKeyframe,
  removeKeyframe,
} from './actions';

const T = (x: number): Transform => ({ x, y: 0, rotation: 0, scale: 1, opacity: 1 });

beforeEach(() => {
  useSceneStore.setState({ scene: createDefaultScene(), past: [], future: [] });
  useSceneStore.getState().addObject({
    id: 'u1',
    type: 'unit',
    transform: T(0),
    layerId: useSceneStore.getState().activeLayerId,
  });
});

describe('timeline actions (scene-store keyframe CRUD)', () => {
  it('addKeyframe inserts sorted and replaces at the same time', () => {
    addKeyframe('u1', { time: 5, transform: T(50) });
    addKeyframe('u1', { time: 1, transform: T(10) });
    // Replace the t=5 keyframe (identity within an object is its time).
    addKeyframe('u1', { time: 5, transform: T(55) });

    const kfs = useSceneStore.getState().scene.keyframes['u1'];
    expect(kfs.map((k) => k.time)).toEqual([1, 5]);
    expect(kfs[1].transform.x).toBe(55);
  });

  it('setKeyframeAtTime captures the object current base transform', () => {
    useSceneStore.getState().updateTransform('u1', { x: 42 });
    setKeyframeAtTime('u1', 3);

    const kfs = useSceneStore.getState().scene.keyframes['u1'];
    expect(kfs).toHaveLength(1);
    expect(kfs[0].time).toBe(3);
    expect(kfs[0].transform.x).toBe(42);
  });

  it('updateKeyframe patches transform and moves time (re-sorted)', () => {
    setKeyframeAtTime('u1', 3);
    updateKeyframe('u1', 3, { transform: { x: 7 }, time: 8 });

    const kfs = useSceneStore.getState().scene.keyframes['u1'];
    expect(kfs).toHaveLength(1);
    expect(kfs[0].time).toBe(8);
    expect(kfs[0].transform.x).toBe(7);
  });

  it('updateKeyframe moving onto an occupied time REPLACES the occupant (time-identity invariant)', () => {
    addKeyframe('u1', { time: 1, transform: T(10) });
    addKeyframe('u1', { time: 2, transform: T(20) });
    updateKeyframe('u1', 1, { time: 2 }); // move kf@1 onto kf@2

    const kfs = useSceneStore.getState().scene.keyframes['u1'];
    // No duplicate times may exist — identity within an object is its time.
    expect(kfs).toHaveLength(1);
    expect(kfs[0].time).toBe(2);
    expect(kfs[0].transform.x).toBe(10); // moved keyframe's transform wins
  });

  it('removeKeyframe removes the keyframe at that time', () => {
    addKeyframe('u1', { time: 1, transform: T(10) });
    addKeyframe('u1', { time: 2, transform: T(20) });

    removeKeyframe('u1', 1);
    let kfs = useSceneStore.getState().scene.keyframes['u1'];
    expect(kfs.map((k) => k.time)).toEqual([2]);

    removeKeyframe('u1', 2); // last one -> record cleaned up
    kfs = useSceneStore.getState().scene.keyframes['u1'];
    expect(kfs === undefined || kfs.length === 0).toBe(true);
  });

  it('keyframes remain in scene.keyframes (single source of truth) and are undoable', () => {
    setKeyframeAtTime('u1', 4);
    const before = useSceneStore.getState().scene.keyframes['u1'].length;
    useSceneStore.getState().undo();
    const after = useSceneStore.getState().scene.keyframes['u1'] ?? [];
    expect(before).toBe(1);
    expect(after.length).toBe(0);
  });

  it('addKeyframe / updateKeyframe / removeKeyframe are each undoable', () => {
    addKeyframe('u1', { time: 3, transform: T(30) });
    useSceneStore.getState().undo();
    expect((useSceneStore.getState().scene.keyframes['u1'] ?? []).length).toBe(0);

    addKeyframe('u1', { time: 3, transform: T(30) });
    updateKeyframe('u1', 3, { time: 6, transform: { x: 60 } });
    useSceneStore.getState().undo();
    let kfs = useSceneStore.getState().scene.keyframes['u1'];
    expect(kfs.map((k) => k.time)).toEqual([3]);
    expect(kfs[0].transform.x).toBe(30);

    removeKeyframe('u1', 3);
    useSceneStore.getState().undo();
    kfs = useSceneStore.getState().scene.keyframes['u1'];
    expect(kfs.map((k) => k.time)).toEqual([3]);
  });

  it('keyframeSelectionAtTime writes every valid id in ONE undo step, skips unknown ids', () => {
    useSceneStore.getState().addObject({
      id: 'u2',
      type: 'unit',
      transform: T(5),
      layerId: useSceneStore.getState().activeLayerId,
    });
    const pastBefore = useSceneStore.getState().past.length;
    const count = keyframeSelectionAtTime(['u1', 'u2', 'ghost'], 4);
    expect(count).toBe(2);
    const st = useSceneStore.getState();
    expect(st.scene.keyframes['u1']?.map((k) => k.time)).toEqual([4]);
    expect(st.scene.keyframes['u2']?.map((k) => k.time)).toEqual([4]);
    expect(st.scene.keyframes['u2']?.[0].transform.x).toBe(5);
    expect(st.past.length).toBe(pastBefore + 1); // one entry for both
    st.undo();
    const after = useSceneStore.getState().scene.keyframes;
    expect(after['u1']).toBeUndefined();
    expect(after['u2']).toBeUndefined();
    expect(keyframeSelectionAtTime([], 4)).toBe(0);
    expect(keyframeSelectionAtTime(['ghost'], 4)).toBe(0);
  });
});
