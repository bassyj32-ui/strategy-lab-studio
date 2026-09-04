import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from '../scene/store';
import { usePlaybackStore } from '../timeline/playbackStore';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';
import { resolveOp } from '../ai/tools';

const s = () => useSceneStore.getState();

const reset = () => {
  useSceneStore.setState({
    scene: createDefaultScene(),
    past: [],
    future: [],
    selectedObjId: null,
    activeLayerId: DEFAULT_LAYER_ID,
  });
  s().setAutoKeyframe(false);
  usePlaybackStore.setState({ currentTime: 0 });
};

describe('applyMotionPreset (store action)', () => {
  beforeEach(reset);

  it('march writes staggered keys and undoes in ONE step', () => {
    const a = s().createObjectOfType('unit', { x: 100, y: 100 });
    const b = s().createObjectOfType('unit', { x: 200, y: 100 });
    s().setSelectedIds([a, b]);

    s().applyMotionPreset('march', {
      ids: [a, b],
      anchor: { x: 1000, y: 500 },
      startAt: 1,
      duration: 3,
      stagger: 0.5,
    });
    const kf = s().scene.keyframes;
    expect(kf[a].map((k) => k.time)).toEqual([1, 4]);
    expect(kf[b].map((k) => k.time)).toEqual([1.5, 4.5]);
    expect(kf[a][0].easing).toBe('linear');

    // Selection survives (commander keeps tweaking the keys).
    expect(s().selectedIds).toEqual([a, b]);

    s().undo();
    expect(s().scene.keyframes[a]).toBeUndefined();
    expect(s().scene.keyframes[b]).toBeUndefined();
  });

  it('camera-push appends without touching object tracks', () => {
    const a = s().createObjectOfType('unit', { x: 100, y: 100 });
    s().setCameraKeyframe(2);
    const seeded = [...s().scene.cameraTrack!];

    s().applyMotionPreset('camera-push', { ids: [], startAt: 3, duration: 2 });
    const track = s().scene.cameraTrack!;
    expect(track.length).toBeGreaterThan(seeded.length);
    expect(track.slice(0, seeded.length)).toEqual(seeded);
    expect(s().scene.keyframes[a]).toBeUndefined();

    s().undo();
    expect(s().scene.cameraTrack).toEqual(seeded);
  });

  it('settle softens an existing arrival in one step', () => {
    const a = s().createObjectOfType('unit', { x: 100, y: 100 });
    s().setSelected(a);
    const t0 = { ...s().scene.objects[a].transform };
    s().addKeyframe(a, { time: 0, transform: t0 });
    s().addKeyframe(a, { time: 4, transform: { ...t0, x: 500 } });

    s().applyMotionPreset('settle', { ids: [a] });
    const list = s().scene.keyframes[a];
    expect(list).toHaveLength(2);
    expect(list[0].easing).toBe('easeOut');
  });
});

describe('apply_motion_preset (AI commander path)', () => {
  beforeEach(reset);

  it('resolveOp accepts kind + targets + timing, then applyAIBatch lands keys', () => {
    const a = s().createObjectOfType('unit', { x: 100, y: 100 });
    s().updateObjectProps(a, { label: 'Cavalry' });
    const scene = s().scene;
    const res = resolveOp(
      {
        tool: 'apply_motion_preset',
        args: {
          kind: 'charge',
          targets: ['Cavalry'],
          anchorX: 800,
          anchorY: 400,
          duration: 1.6,
        },
      },
      scene
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.resolved).toMatchObject({ tool: 'apply_motion_preset', kind: 'charge', ids: [a] });

    const out = s().applyAIBatch([res.resolved], 'AI Change #1');
    expect(out).toEqual({ applied: 1, errors: [] });
    const kf = s().scene.keyframes[a];
    expect(kf).toHaveLength(2);
    expect(kf[0].easing).toBe('easeIn');
    expect(kf[0].cpOut).toBeDefined();
  });

  it('rejects missing kind, missing targets, and unknown labels', () => {
    const scene = s().scene;
    expect(resolveOp({ tool: 'apply_motion_preset', args: {} }, scene).ok).toBe(false);
    expect(
      resolveOp({ tool: 'apply_motion_preset', args: { kind: 'march' } }, scene).ok
    ).toBe(false);
    expect(
      resolveOp(
        { tool: 'apply_motion_preset', args: { kind: 'march', targets: ['ghost'] } },
        scene
      ).ok
    ).toBe(false);
    // camera-push needs no targets.
    expect(
      resolveOp({ tool: 'apply_motion_preset', args: { kind: 'camera-push' } }, scene)
        .ok
    ).toBe(true);
  });

  it('applyAIBatch reports an error when the preset touches nothing', () => {
    const out = s().applyAIBatch([
      { tool: 'apply_motion_preset', kind: 'march', ids: ['ghost'], opts: {} },
    ]);
    expect(out.applied).toBe(0);
    expect(out.errors).toHaveLength(1);
  });
});
