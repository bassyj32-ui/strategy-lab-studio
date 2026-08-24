import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from './store';
import { createDefaultScene, DEFAULT_LAYER_ID } from './factory';
import { getObjectWorldTransformAtTime } from '../timeline/selectors';
import { getCameraAtTime } from '../timeline/cameraTrack';
import type { Transform } from './types';

const s = () => useSceneStore.getState();

const reset = () => {
  useSceneStore.setState({
    scene: createDefaultScene(),
    past: [],
    future: [],
    selectedObjId: null,
    activeLayerId: DEFAULT_LAYER_ID,
  });
};

describe('scene store', () => {
  beforeEach(reset);

  it('createObjectOfType assigns a fresh id + the active layer', () => {
    const id = s().createObjectOfType('shape');
    const obj = s().scene.objects[id];
    expect(obj).toBeDefined();
    expect(obj.type).toBe('shape');
    expect(obj.layerId).toBe(DEFAULT_LAYER_ID);
    expect(id.startsWith('shape-')).toBe(true);
  });

  it('createObjectOfType drops at the supplied world position', () => {
    const id = s().createObjectOfType('marker', { x: 123, y: 456 });
    expect(s().scene.objects[id].transform.x).toBe(123);
    expect(s().scene.objects[id].transform.y).toBe(456);
  });

  it("createObjectOfType('arrow') persists arrow-only fields and is undoable", () => {
    const id = s().createObjectOfType('arrow', {
      x: 10,
      y: 20,
      length: 240,
      color: '#ef4444',
    });
    const obj = s().scene.objects[id];
    expect(obj.type).toBe('arrow');
    expect(obj.length).toBe(240);
    expect(obj.color).toBe('#ef4444');
    expect(id.startsWith('arrow-')).toBe(true);

    s().undo();
    expect(s().scene.objects[id]).toBeUndefined();
    s().redo();
    expect(s().scene.objects[id]?.length).toBe(240);
  });

  it('createObjectOfType passes rotation through (draw-gesture placement)', () => {
    const id = s().createObjectOfType('arrow', {
      x: 100,
      y: 200,
      rotation: -37.5,
      length: 180,
    });
    const t = s().scene.objects[id].transform;
    expect(t.x).toBe(100);
    expect(t.y).toBe(200);
    expect(t.rotation).toBeCloseTo(-37.5);
  });

  it('updateObjectProps patches length/color without touching the transform', () => {
    const id = s().createObjectOfType('arrow', { x: 5, y: 6 });
    const before = { ...s().scene.objects[id].transform };
    s().beginInteraction();
    s().updateObjectProps(id, { length: 400, color: '#123456' });
    s().endInteraction();
    const obj = s().scene.objects[id];
    expect(obj.length).toBe(400);
    expect(obj.color).toBe('#123456');
    expect(obj.transform).toEqual(before);

    // One undoable session restores both props.
    s().undo();
    expect(s().scene.objects[id].length).not.toBe(400);
  });

  it('updateObjectProps is a no-op for unknown ids', () => {
    expect(() => s().updateObjectProps('nope', { length: 99 })).not.toThrow();
  });

  it('updateObjectProps writes commander annotations (label/faction/confidence)', () => {
    const id = s().createObjectOfType('marker');
    s().beginInteraction();
    s().updateObjectProps(id, {
      label: 'Alexander',
      faction: 'red',
      confidence: 'confirmed',
    });
    s().endInteraction();
    const obj = s().scene.objects[id];
    expect(obj.label).toBe('Alexander');
    expect(obj.faction).toBe('red');
    expect(obj.confidence).toBe('confirmed');

    // One undo step reverts all three.
    s().undo();
    const reverted = s().scene.objects[id];
    expect(reverted.label).toBeUndefined();
    expect(reverted.faction).toBeUndefined();
    expect(reverted.confidence).toBeUndefined();

    // Empty label trims to delete; null confidence clears.
    s().beginInteraction();
    s().updateObjectProps(id, { label: 'X', faction: 'blue', confidence: 'probable' });
    s().endInteraction();
    s().beginInteraction();
    s().updateObjectProps(id, { label: '   ', confidence: null });
    s().endInteraction();
    const cleared = s().scene.objects[id];
    expect(cleared.label).toBeUndefined();
    expect(cleared.confidence).toBeUndefined();
    expect(cleared.faction).toBe('blue');
  });

  it('updateObjectProps writes and clears the procedural effect (§50)', () => {
    const id = s().createObjectOfType('marker');
    s().beginInteraction();
    s().updateObjectProps(id, { effect: 'smoke' });
    s().endInteraction();
    expect(s().scene.objects[id].effect).toBe('smoke');

    // Empty string clears (Inspector sends undefined; store deletes).
    s().beginInteraction();
    s().updateObjectProps(id, { effect: undefined });
    s().endInteraction();
    expect(s().scene.objects[id].effect).toBeUndefined();

    // One undo step restores the previous state (smoke again).
    s().undo();
    expect(s().scene.objects[id].effect).toBe('smoke');
  });

  it('setTool toggles the canvas tool (store-root, not undoable)', () => {
    expect(s().activeTool).toBe('select');
    s().setTool('arrow');
    expect(s().activeTool).toBe('arrow');
    s().undo();
    expect(s().activeTool).toBe('arrow'); // Tool state survives undo/redo.
    s().setTool('select');
    expect(s().activeTool).toBe('select');
  });

  it('updateTransform performs a PARTIAL merge (keeps unspecified fields)', () => {
    const id = s().createObjectOfType('shape');
    s().updateTransform(id, { x: 50 });
    const t = s().scene.objects[id].transform;
    expect(t.x).toBe(50);
    expect(t.y).toBe(0);
    expect(t.opacity).toBe(1);
    expect(t.scale).toBe(1);
  });

  it('updateTransform with undefined does not clobber existing values', () => {
    const id = s().createObjectOfType('shape');
    s().updateTransform(id, { x: 42 });
    s().updateTransform(id, { x: undefined });
    expect(s().scene.objects[id].transform.x).toBe(42);
  });

  describe('setKeyframeCp (P1 curved paths)', () => {
    const mkAnimated = (): { id: string } => {
      const id = s().createObjectOfType('shape');
      s().addKeyframe(id, {
        time: 0,
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
      });
      s().addKeyframe(id, {
        time: 10,
        transform: { x: 100, y: 0, rotation: 0, scale: 1, opacity: 1 },
      });
      return { id };
    };

    it('writes cpOut / cpIn offsets onto the right keyframes', () => {
      const { id } = mkAnimated();
      s().setKeyframeCp(id, 0, 'cpOut', { dx: 30, dy: -40 });
      s().setKeyframeCp(id, 10, 'cpIn', { dx: -20, dy: 15 });
      const kfs = s().scene.keyframes[id];
      expect(kfs[0].cpOut).toEqual({ dx: 30, dy: -40 });
      expect(kfs[1].cpIn).toEqual({ dx: -20, dy: 15 });
    });

    it('null clears a control point (back to linear)', () => {
      const { id } = mkAnimated();
      s().setKeyframeCp(id, 0, 'cpOut', { dx: 30, dy: -40 });
      expect(s().scene.keyframes[id][0].cpOut).toBeDefined();
      s().setKeyframeCp(id, 0, 'cpOut', null);
      // Absent — not merely undefined-valued — so JSON round-trips stay clean.
      expect('cpOut' in s().scene.keyframes[id][0]).toBe(false);
    });

    it('is a no-op for unknown object ids and unknown times', () => {
      const { id } = mkAnimated();
      expect(() =>
        s().setKeyframeCp('ghost', 0, 'cpOut', { dx: 1, dy: 1 })
      ).not.toThrow();
      expect(() =>
        s().setKeyframeCp(id, 999, 'cpOut', { dx: 1, dy: 1 })
      ).not.toThrow();
      expect(s().scene.keyframes[id][0].cpOut).toBeUndefined();
    });

    it('a handle drag session = exactly ONE undoable history entry', () => {
      const { id } = mkAnimated();
      expect(s().past.length).toBeGreaterThan(0);
      const lenBefore = s().past.length;

      s().beginInteraction();
      // Simulate many dragMove writes.
      for (let i = 1; i <= 10; i++) {
        s().setKeyframeCp(id, 0, 'cpOut', { dx: i * 5, dy: -i * 3 });
      }
      s().endInteraction();

      expect(s().scene.keyframes[id][0].cpOut).toEqual({ dx: 50, dy: -30 });
      expect(s().past.length).toBe(lenBefore + 1);
      // A single undo reverts the ENTIRE drag.
      s().undo();
      expect(s().scene.keyframes[id][0].cpOut).toBeUndefined();
    });

    it('a discrete clear is one undoable step (session, not nested transaction)', () => {
      const { id } = mkAnimated();
      // NOTE: never nest setKeyframeCp INSIDE transaction() — the inner
      // set() races the open immer producer and the write is lost. Discrete
      // edits use the same begin/end session as drags.
      s().beginInteraction();
      s().setKeyframeCp(id, 0, 'cpOut', { dx: 10, dy: 10 });
      s().endInteraction();
      expect(s().scene.keyframes[id][0].cpOut).toEqual({ dx: 10, dy: 10 });

      s().beginInteraction();
      s().setKeyframeCp(id, 0, 'cpOut', null);
      s().endInteraction();
      expect(s().scene.keyframes[id][0].cpOut).toBeUndefined();

      s().undo(); // undoes the clear
      expect(s().scene.keyframes[id][0].cpOut).toEqual({ dx: 10, dy: 10 });
      s().undo(); // undoes the set
      expect(s().scene.keyframes[id][0].cpOut).toBeUndefined();
    });
  });

  describe('layers', () => {
    it('addLayer appends a visible layer with a higher order', () => {
      s().addLayer('Test');
      expect(s().scene.layers).toHaveLength(2);
      const added = s().scene.layers.find((l) => l.name === 'Test')!;
      expect(added.visible).toBe(true);
      expect(added.order).toBeGreaterThan(0);
    });

    it('renameLayer changes the name', () => {
      s().addLayer('Test');
      const added = s().scene.layers.find((l) => l.name === 'Test')!;
      s().renameLayer(added.id, 'Renamed');
      expect(s().scene.layers.find((l) => l.id === added.id)!.name).toBe('Renamed');
    });

    it('toggleLayerVisible flips visibility', () => {
      s().addLayer('Test');
      const added = s().scene.layers.find((l) => l.name === 'Test')!;
      s().toggleLayerVisible(added.id);
      expect(s().scene.layers.find((l) => l.id === added.id)!.visible).toBe(false);
    });

    it('reorderLayers swaps neighbour orders', () => {
      s().addLayer('A');
      s().addLayer('B');
      const a = s().scene.layers.find((l) => l.name === 'A')!;
      const b = s().scene.layers.find((l) => l.name === 'B')!;
      const aOrderBefore = a.order;
      s().reorderLayers(a.id, 'down');
      const aAfter = s().scene.layers.find((l) => l.id === a.id)!;
      const bAfter = s().scene.layers.find((l) => l.id === b.id)!;
      expect(aAfter.order).toBe(b.order);
      expect(bAfter.order).toBe(aOrderBefore);
    });

    it('removeLayer reassigns its objects to the default layer', () => {
      s().addLayer('L2');
      const l2 = s().scene.layers.find((l) => l.name === 'L2')!;
      s().setActiveLayer(l2.id);
      const id = s().createObjectOfType('marker');
      expect(s().scene.objects[id].layerId).toBe(l2.id);

      s().removeLayer(l2.id);
      expect(s().scene.layers.find((l) => l.id === l2.id)).toBeUndefined();
      expect(s().scene.objects[id].layerId).toBe(DEFAULT_LAYER_ID);
    });

    it('setLayerDepth writes depthFactor and one undo restores the default', () => {
      s().addLayer('Par');
      const layer = s().scene.layers.find((l) => l.name === 'Par')!;
      s().setLayerDepth(layer.id, 0.5);
      expect(s().scene.layers.find((l) => l.id === layer.id)!.depthFactor).toBe(0.5);
      s().undo();
      expect(
        s().scene.layers.find((l) => l.id === layer.id)!.depthFactor
      ).toBeUndefined();
    });

    it('setLayerDepth clamps out-of-range values; the 1 default removes the field entirely', () => {
      s().addLayer('Par');
      const layer = s().scene.layers.find((l) => l.name === 'Par')!;
      // 3 clamps to 1, which IS the default → stored as absent so saves stay
      // byte-stable with pre-parallax files.
      s().setLayerDepth(layer.id, 3);
      const clamped = s().scene.layers.find((l) => l.id === layer.id)!;
      expect(clamped.depthFactor).toBeUndefined();
      expect('depthFactor' in clamped).toBe(false);
    });

    it('depthFactor survives a project save/load roundtrip', () => {
      s().addLayer('Par');
      const layer = s().scene.layers.find((l) => l.name === 'Par')!;
      s().setLayerDepth(layer.id, 0.25);
      const json = JSON.stringify(s().getProject());
      s().loadProjectFromJson(json);
      const restored = s().scene.layers.find((l) => l.name === 'Par')!;
      expect(restored.depthFactor).toBe(0.25);
    });

    it('removeLayer(DEFAULT_LAYER_ID) reassigns its objects to a SURVIVING layer (never orphans)', () => {
      s().addLayer('L2');
      const l2 = s().scene.layers.find((l) => l.name === 'L2')!;
      // Objects live on DEFAULT_LAYER_ID while it is the active layer.
      s().setActiveLayer(DEFAULT_LAYER_ID);
      const a = s().createObjectOfType('shape');
      const b = s().createObjectOfType('marker');
      expect(s().scene.objects[a].layerId).toBe(DEFAULT_LAYER_ID);
      expect(s().scene.objects[b].layerId).toBe(DEFAULT_LAYER_ID);

      s().removeLayer(DEFAULT_LAYER_ID);

      const survivorIds = new Set(s().scene.layers.map((l) => l.id));
      expect(survivorIds.has(DEFAULT_LAYER_ID)).toBe(false);
      // Every object references a layer that still exists.
      for (const obj of Object.values(s().scene.objects)) {
        expect(survivorIds.has(obj.layerId)).toBe(true);
      }
      // Reassigned onto the surviving layer (first remaining by order).
      expect(s().scene.objects[a].layerId).toBe(l2.id);
      expect(s().scene.objects[b].layerId).toBe(l2.id);
      // activeLayerId points at a surviving layer, never the deleted one.
      expect(s().activeLayerId).not.toBe(DEFAULT_LAYER_ID);
      expect(survivorIds.has(s().activeLayerId)).toBe(true);
    });

    it('removeLayer forbids deleting the last remaining layer', () => {
      const before = s().scene.layers.length;
      s().removeLayer(DEFAULT_LAYER_ID);
      expect(s().scene.layers.length).toBe(before);
    });
  });

  describe('undo / redo', () => {
    it('undo removes a created object and redo restores it', () => {
      const id = s().createObjectOfType('shape');
      s().undo();
      expect(s().scene.objects[id]).toBeUndefined();
      s().redo();
      expect(s().scene.objects[id]).toBeDefined();
    });

    it('undo clears selection when its object is gone', () => {
      const id = s().createObjectOfType('shape');
      s().setSelected(id);
      expect(s().selectedObjId).toBe(id);
      s().undo();
      expect(s().selectedObjId).toBeNull();
    });

    it('undo/redo never touch selectedObjId / activeLayerId', () => {
      s().addLayer('LX');
      const lx = s().scene.layers.find((l) => l.name === 'LX')!;
      s().setActiveLayer(lx.id);
      s().undo(); // undoes the addLayer
      expect(s().activeLayerId).toBe(lx.id); // untouched
      // createObjectOfType then falls back to the default layer if active is gone
      const id = s().createObjectOfType('shape');
      expect(s().scene.objects[id].layerId).toBe(DEFAULT_LAYER_ID);
    });

    it('endInteraction drops a no-op edit session (no spurious history)', () => {
      const id = s().createObjectOfType('shape');
      expect(s().scene.objects[id]).toBeDefined();
      s().beginInteraction();
      // no transform change
      s().endInteraction();
      const historyLenAfterCreate = 1;
      expect(s().past.length).toBe(historyLenAfterCreate);
    });

    it('N moveObjectBy calls in ONE begin/endInteraction gesture = exactly ONE history entry', () => {
      const id = s().createObjectOfType('shape');
      expect(s().past.length).toBe(1); // the create

      s().beginInteraction();
      const N = 10;
      for (let i = 0; i < N; i++) s().moveObjectBy(id, 10, 0);
      s().endInteraction();

      expect(s().scene.objects[id].transform.x).toBe(10 * N);
      // Exactly ONE entry for the whole gesture (create + gesture).
      expect(s().past.length).toBe(2);
      // A single undo reverts the ENTIRE drag.
      s().undo();
      expect(s().scene.objects[id].transform.x).toBe(0);
    });

    it('history evicts beyond MAX_HISTORY=100 (oldest snapshots dropped)', () => {
      const id = s().createObjectOfType('shape');
      // 120 transactions, each moving x by +1 so every snapshot is distinct.
      for (let i = 0; i < 120; i++) {
        s().transaction((scene) => {
          scene.objects[id].transform.x += 1;
        });
      }
      expect(s().scene.objects[id].transform.x).toBe(120);
      // Stack is capped at MAX_HISTORY (100), not grown to 120.
      expect(s().past.length).toBe(100);
      // Undoing everything possible lands at x=20 — proving the OLDEST 20
      // snapshots were evicted (a full stack would floor out at x=0).
      for (let i = 0; i < 100; i++) s().undo();
      expect(s().past.length).toBe(0);
      expect(s().scene.objects[id].transform.x).toBe(20);
    });

    it('a new transaction clears `future`', () => {
      const id = s().createObjectOfType('shape');
      s().transaction((scene) => {
        scene.objects[id].transform.x = 5;
      });
      s().undo();
      expect(s().future.length).toBeGreaterThan(0);
      // A fresh transaction invalidates every redo entry.
      s().transaction((scene) => {
        scene.objects[id].transform.x = 9;
      });
      expect(s().future.length).toBe(0);
    });
  });

  describe('groups: world transform + keyframe rebase', () => {
    beforeEach(reset);

    const worldAt = (id: string, t: number): Transform =>
      getObjectWorldTransformAtTime(s().scene, id, t);

    it('grouping a keyframed child preserves its world position', () => {
      const parent = s().createObjectOfType('shape', { x: 100, y: 100 });
      const child = s().createObjectOfType('shape', { x: 150, y: 50 });
      // Child has a world-space keyframe at t=10.
      s().addKeyframe(child, {
        time: 10,
        transform: { x: 200, y: 50, rotation: 0, scale: 1, opacity: 1 },
      });

      const before = worldAt(child, 10);

      const pid = s().groupObject([parent, child]);
      expect(pid).toBe(parent);
      expect(s().scene.objects[child].parentId).toBe(parent);

      const after = worldAt(child, 10);
      // Re-parenting must NOT move the object through its animation.
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    });

    it('moving the group parent moves the child in world space (export-correct)', () => {
      const parent = s().createObjectOfType('shape', { x: 100, y: 100 });
      const child = s().createObjectOfType('shape', { x: 150, y: 50 });
      s().groupObject([parent, child]);

      const before = worldAt(child, 0);
      s().moveGroup(parent, 30, -10);
      const after = worldAt(child, 0);

      expect(after.x).toBeCloseTo(before.x + 30, 6);
      expect(after.y).toBeCloseTo(before.y - 10, 6);
    });
  });

  describe('camera track (animated camera)', () => {
    beforeEach(reset);

    it('setCameraKeyframe stores the live view at the time and sorts the track', () => {
      s().updateCamera((cam) => ({ ...cam, x: 500, y: 300, zoom: 2 }));
      s().setCameraKeyframe(4);
      s().updateCamera((cam) => ({ ...cam, x: 100, y: 200, zoom: 3 }));
      s().setCameraKeyframe(1);
      const track = s().scene.cameraTrack!;
      expect(track.map((k) => k.time)).toEqual([1, 4]);
      expect(track[0].cam).toEqual({ x: 100, y: 200, zoom: 3, rotation: 0 });
      expect(track[1].cam).toEqual({ x: 500, y: 300, zoom: 2, rotation: 0 });
    });

    it('setCameraKeyframe captures the live rotation (radians)', () => {
      s().updateCamera((cam) => ({ ...cam, rotation: Math.PI / 6 }));
      s().setCameraKeyframe(2);
      expect(s().scene.cameraTrack![0].cam.rotation).toBeCloseTo(Math.PI / 6);
    });

    it('re-keying the same time REPLACES instead of duplicating', () => {
      s().setCameraKeyframe(2);
      s().updateCamera((cam) => ({ ...cam, x: 42 }));
      s().setCameraKeyframe(2);
      expect(s().scene.cameraTrack).toHaveLength(1);
      expect(s().scene.cameraTrack![0].cam.x).toBe(42);
    });

    it('removeCameraKeyframe deletes and prunes an emptied track', () => {
      s().setCameraKeyframe(2);
      s().removeCameraKeyframe(2);
      expect(s().scene.cameraTrack).toBeUndefined();
      // Removing a non-existent key is a no-op that still must not throw.
      s().removeCameraKeyframe(99);
      expect(s().scene.cameraTrack).toBeUndefined();
    });

    it('moveCameraKeyframe relocates a key; landing on an occupied time replaces', () => {
      s().updateCamera((cam) => ({ ...cam, x: 10 }));
      s().setCameraKeyframe(1);
      s().updateCamera((cam) => ({ ...cam, x: 20 }));
      s().setCameraKeyframe(3);
      s().moveCameraKeyframe(3, 5);
      let track = s().scene.cameraTrack!;
      expect(track.map((k) => k.time)).toEqual([1, 5]);
      expect(track[1].cam.x).toBe(20);
      // Moving onto the occupied time 1 replaces the occupant.
      s().moveCameraKeyframe(5, 1);
      track = s().scene.cameraTrack!;
      expect(track).toHaveLength(1);
      expect(track[0].time).toBe(1);
      expect(track[0].cam.x).toBe(20);
      // Moving a non-existent key is a no-op.
      s().moveCameraKeyframe(99, 2);
      expect(s().scene.cameraTrack!.map((k) => k.time)).toEqual([1]);
    });

    it('each camera-track mutation is exactly ONE undo step', () => {
      s().setCameraKeyframe(1);
      s().undo();
      expect(s().scene.cameraTrack).toBeUndefined();

      s().setCameraKeyframe(1);
      s().setCameraKeyframe(3);
      s().undo();
      expect(s().scene.cameraTrack!.map((k) => k.time)).toEqual([1]);

      s().redo();
      expect(s().scene.cameraTrack!.map((k) => k.time)).toEqual([1, 3]);
    });

    it('getCameraAtTime sees store-written tracks end-to-end', () => {
      s().updateCamera((cam) => ({ ...cam, x: 0 }));
      s().setCameraKeyframe(0);
      s().updateCamera((cam) => ({ ...cam, x: 100, zoom: 2 }));
      s().setCameraKeyframe(2);
      const scene = s().scene;
      const mid = getCameraAtTime(scene, 1);
      expect(mid.x).toBeCloseTo(50);
      expect(mid.zoom).toBeCloseTo(1.5);
      expect(getCameraAtTime(scene, 9).x).toBe(100); // HOLD after last
    });
  });

  describe('asset library (project-scoped, mirrored across scenes)', () => {
    const asset = {
      id: 'lib-1',
      kind: 'image' as const,
      name: 'flag',
      src: 'data:image/png;base64,xxxx',
      width: 16,
      height: 16,
    };

    const twoScenes = () => {
      const b = createDefaultScene('b');
      useSceneStore.setState({
        scene: createDefaultScene('a'),
        inactiveScenes: { b },
      });
    };

    it('registerAsset mirrors the asset into every scene', () => {
      twoScenes();
      s().registerAsset(asset);
      expect(s().scene.assets['lib-1']).toBeDefined();
      expect(s().inactiveScenes.b.assets['lib-1']).toBeDefined();
    });

    it('canDeleteAsset is true for an unreferenced asset', () => {
      twoScenes();
      s().registerAsset(asset);
      expect(s().canDeleteAsset('lib-1')).toBe(true);
    });

    it('canDeleteAsset is false when an object references the asset', () => {
      twoScenes();
      s().registerAsset(asset);
      s().createObjectOfType('marker', { assetId: 'lib-1' });
      expect(s().canDeleteAsset('lib-1')).toBe(false);
    });

    it('canDeleteAsset is false when a scene uses the asset as its map', () => {
      twoScenes();
      s().registerAsset(asset);
      useSceneStore.setState({ scene: { ...s().scene, mapAssetId: 'lib-1' } });
      expect(s().canDeleteAsset('lib-1')).toBe(false);
    });

    it('deleteAsset removes the asset project-wide when unreferenced', () => {
      twoScenes();
      s().registerAsset(asset);
      expect(s().deleteAsset('lib-1')).toBe(true);
      expect(s().scene.assets['lib-1']).toBeUndefined();
      expect(s().inactiveScenes.b.assets['lib-1']).toBeUndefined();
    });

    it('deleteAsset is a no-op (returns false) while referenced', () => {
      twoScenes();
      s().registerAsset(asset);
      s().createObjectOfType('marker', { assetId: 'lib-1' });
      expect(s().deleteAsset('lib-1')).toBe(false);
      // Asset remains in all scenes.
      expect(s().scene.assets['lib-1']).toBeDefined();
      expect(s().inactiveScenes.b.assets['lib-1']).toBeDefined();
    });

    it('deleteAsset is undoable (one step)', () => {
      twoScenes();
      s().registerAsset(asset);
      expect(s().deleteAsset('lib-1')).toBe(true);
      s().undo();
      expect(s().scene.assets['lib-1']).toBeDefined();
      expect(s().inactiveScenes.b.assets['lib-1']).toBeDefined();
    });
  });

  describe('applyCameraPreset (§27 presets onto the camera track)', () => {
    beforeEach(reset);

    it('works when no track existed and replaces the whole track', () => {
      expect(s().scene.cameraTrack).toBeUndefined();
      s().applyCameraPreset('tactical');
      const track = s().scene.cameraTrack!;
      expect(track).toHaveLength(1);
      expect(track[0].cam.zoom).toBe(1.8);

      // Applying again REPLACES (not appends).
      s().applyCameraPreset('decisive');
      expect(s().scene.cameraTrack!).toHaveLength(2);
    });

    it('replacing a preset is ONE undo step that restores the prior track', () => {
      // Seed an existing track.
      s().updateCamera((cam) => ({ ...cam, x: 42 }));
      s().setCameraKeyframe(3);
      const seeded = s().scene.cameraTrack;

      s().applyCameraPreset('overview');
      expect(s().scene.cameraTrack).not.toEqual(seeded);

      s().undo();
      expect(s().scene.cameraTrack).toEqual(seeded);
    });

    it('commander-focus honours the passed focus point', () => {
      s().applyCameraPreset('commander-focus', { x: 100, y: 200 });
      const kf = s().scene.cameraTrack![0];
      expect(kf.cam.x).toBe(100);
      expect(kf.cam.y).toBe(200);
      expect(kf.cam.zoom).toBe(2);
    });
  });

  describe('triggerDecisiveMove (§38 macro)', () => {
    beforeEach(reset);

    it('creates marker + arrow objects at the focus and writes pulse keyframes', () => {
      const before = Object.keys(s().scene.objects);
      s().triggerDecisiveMove({ focus: { x: 800, y: 400 } });
      const scene = s().scene;
      const created = Object.keys(scene.objects).filter(
        (id) => !before.includes(id)
      );
      // Highlight marker + tactical arrow.
      expect(created).toHaveLength(2);
      const marker = scene.objects[created.find((id) => scene.objects[id].type === 'marker')!];
      expect(marker.transform.x).toBe(800);
      expect(marker.transform.y).toBe(400);
      // Pulse keyframes exist for the highlight.
      expect(scene.keyframes[marker.id]!.length).toBeGreaterThan(1);
    });

    it('is ONE undo step: undo removes objects AND restores the prior camera state', () => {
      s().updateCamera((cam) => ({ ...cam, x: 42 }));
      s().setCameraKeyframe(3);
      const seededTrack = s().scene.cameraTrack;
      const seededIds = Object.keys(s().scene.objects);

      s().triggerDecisiveMove({ vignette: true });
      expect(Object.keys(s().scene.objects).length).toBeGreaterThan(seededIds.length);
      expect(s().scene.vignette).toBe(true);

      s().undo();
      expect(Object.keys(s().scene.objects)).toEqual(seededIds);
      expect(s().scene.cameraTrack).toEqual(seededTrack);
      expect(s().scene.vignette).toBeUndefined();
    });
  });
});

describe('z-depth (§48 adjustable ordering)', () => {
  beforeEach(reset);

  it('updateObjectProps writes z and explicit null clears it (undoable)', () => {
    const id = s().createObjectOfType('marker');
    s().beginInteraction();
    s().updateObjectProps(id, { z: 7 });
    s().endInteraction();
    expect(s().scene.objects[id].z).toBe(7);

    s().beginInteraction();
    s().updateObjectProps(id, { z: null });
    s().endInteraction();
    expect(s().scene.objects[id].z).toBeUndefined();

    // One undo restores the write of 7.
    s().undo();
    expect(s().scene.objects[id].z).toBe(7);
  });
});
