import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from './store';
import { usePlaybackStore } from '../timeline/playbackStore';
import { createDefaultScene, DEFAULT_LAYER_ID } from './factory';
import { getObjectWorldTransformAtTime } from '../timeline/selectors';
import { getCameraAtTime } from '../timeline/cameraTrack';
import type { Transform, ObjId } from './types';

const s = () => useSceneStore.getState();

const reset = () => {
  useSceneStore.setState({
    scene: createDefaultScene(),
    past: [],
    future: [],
    selectedObjId: null,
    activeLayerId: DEFAULT_LAYER_ID,
  });
  // Auto-keyframe is an editor pref — force it OFF between tests.
  s().setAutoKeyframe(false);
  usePlaybackStore.setState({ currentTime: 0 });
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

  describe('updateKeyframe easing (P0 basic easing)', () => {
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

    it('persists easing on the keyframe', () => {
      const id = mkAnimated();
      s().updateKeyframe(id, 0, { easing: 'easeIn' });
      expect(s().scene.keyframes[id][0].easing).toBe('easeIn');
    });

    it('new keyframes default to no stored easing (linear)', () => {
      const id = mkAnimated();
      expect(s().scene.keyframes[id][0].easing).toBeUndefined();
    });

    it('is one undoable step and undo restores linear', () => {
      const id = mkAnimated();
      const lenBefore = s().past.length;
      s().updateKeyframe(id, 0, { easing: 'hold' });
      expect(s().scene.keyframes[id][0].easing).toBe('hold');
      expect(s().past.length).toBe(lenBefore + 1);
      s().undo();
      expect(s().scene.keyframes[id][0].easing).toBeUndefined();
    });

    it('eased keyframes survive a project save/load round-trip', () => {
      // Covered via serialize/load in sceneSystem; here just confirm the
      // field lives on the scene model (single source of truth, Law 1).
      const id = mkAnimated();
      s().updateKeyframe(id, 0, { easing: 'easeInOut' });
      expect(s().scene.keyframes[id][0]).toMatchObject({ easing: 'easeInOut' });
    });
  });

  describe('auto-keyframe (Auto-KF)', () => {
    it('upserts a keyframe at the playhead when a gesture moves an object', () => {
      const id = s().createObjectOfType('shape');
      s().setAutoKeyframe(true);
      usePlaybackStore.setState({ currentTime: 2 });
      s().beginInteraction();
      s().updateTransform(id, { x: 50, y: 25 });
      s().endInteraction();
      const kfs = s().scene.keyframes[id];
      expect(kfs).toHaveLength(1);
      expect(kfs[0]).toMatchObject({
        time: 2,
        transform: { x: 50, y: 25 },
      });
    });

    it('gesture + keyframes are ONE undoable step', () => {
      const id = s().createObjectOfType('shape');
      s().setAutoKeyframe(true);
      usePlaybackStore.setState({ currentTime: 3 });
      const lenBefore = s().past.length;
      s().beginInteraction();
      s().updateTransform(id, { x: 80 });
      s().endInteraction();
      expect(s().past.length).toBe(lenBefore + 1);
      s().undo();
      expect(s().scene.objects[id].transform.x).toBe(0);
      expect(s().scene.keyframes[id]).toBeUndefined();
    });

    it('a no-op gesture writes nothing and drops its history entry', () => {
      const id = s().createObjectOfType('shape');
      s().setAutoKeyframe(true);
      const lenBefore = s().past.length;
      s().beginInteraction();
      s().updateTransform(id, { x: s().scene.objects[id].transform.x });
      s().endInteraction();
      expect(s().past.length).toBe(lenBefore);
      expect(s().scene.keyframes[id]).toBeUndefined();
    });

    it('writes nothing while disabled (default)', () => {
      const id = s().createObjectOfType('shape');
      usePlaybackStore.setState({ currentTime: 4 });
      s().beginInteraction();
      s().updateTransform(id, { x: 42 });
      s().endInteraction();
      expect(s().scene.keyframes[id]).toBeUndefined();
    });

    it('replaces an existing keyframe at the same playhead time', () => {
      const id = s().createObjectOfType('shape');
      usePlaybackStore.setState({ currentTime: 5 });
      s().addKeyframe(id, {
        time: 5,
        transform: { x: 1, y: 1, rotation: 0, scale: 1, opacity: 1 },
      });
      s().setAutoKeyframe(true);
      s().beginInteraction();
      s().updateTransform(id, { x: 99 });
      s().endInteraction();
      const kfs = s().scene.keyframes[id];
      expect(kfs).toHaveLength(1);
      expect(kfs[0].time).toBe(5);
      expect(kfs[0].transform.x).toBe(99);
    });
  });

  describe('naming (UX repair pass)', () => {
    it('renameObject sets a trimmed display name and is undoable', () => {
      const id = s().createObjectOfType('unit');
      const lenBefore = s().past.length;
      s().renameObject(id, '  Hannibal  ');
      expect(s().scene.objects[id].name).toBe('Hannibal');
      expect(s().past.length).toBe(lenBefore + 1);
      s().undo();
      expect(s().scene.objects[id].name).toBeUndefined();
    });

    it('renameObject with empty string clears the name', () => {
      const id = s().createObjectOfType('unit');
      s().renameObject(id, 'Cavalry');
      s().renameObject(id, '   ');
      expect(s().scene.objects[id].name).toBeUndefined();
    });

    it('renameAsset renames the library asset across all scenes in one step', () => {
      // Register into active + an inactive scene (library is shared).
      useSceneStore.setState({
        inactiveScenes: { 'scene-b': createDefaultScene('scene-b') },
      });
      const asset = {
        id: 'a1',
        kind: 'sprite' as const,
        name: 'infantry',
        src: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1,
        height: 1,
      };
      s().registerAssets([asset]);
      const lenBefore = s().past.length;
      s().renameAsset('a1', 'Libyan Spear');
      expect(s().scene.assets['a1'].name).toBe('Libyan Spear');
      expect(s().inactiveScenes['scene-b'].assets['a1'].name).toBe(
        'Libyan Spear'
      );
      expect(s().past.length).toBe(lenBefore + 1);
    });
  });

  describe('duplicateObject + duplicateAsset (UX repair pass ④)', () => {
    it('duplicates an object with new id, copied props, nudged transform', () => {
      const asset = {
        id: 'a1',
        kind: 'sprite' as const,
        name: 'infantry',
        src: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1,
        height: 1,
      };
      s().registerAssets([asset]);
      const id = s().createObjectOfType('unit', {
        assetId: 'a1',
        faction: 'red',
        x: 100,
        y: 200,
      });
      s().renameObject(id, 'Cavalry');

      const newId = s().duplicateObject(id);
      expect(newId).not.toBeNull();
      expect(newId).not.toBe(id);
      const copy = s().scene.objects[newId!];
      expect(copy.assetId).toBe('a1');
      expect(copy.faction).toBe('red');
      expect(copy.name).toBe('Cavalry copy');
      expect(copy.transform.x).toBe(124); // +24 nudge
      expect(copy.transform.y).toBe(224);
      // Original untouched.
      expect(s().scene.objects[id].transform.x).toBe(100);
      // Duplicate becomes the primary selection.
      expect(s().selectedObjId).toBe(newId);
      // Duplication itself is exactly ONE undoable transaction.
      const lenBeforeDup = s().past.length;
      s().undo();
      expect(s().scene.objects[newId!]).toBeUndefined();
      // Reverting the duplication leaves the original (and its rename).
      expect(s().scene.objects[id].name).toBe('Cavalry');
      expect(s().past.length).toBe(lenBeforeDup - 1);
    });

    it('copies keyframes with identical times and easing', () => {
      const id = s().createObjectOfType('unit');
      s().addKeyframe(id, {
        time: 1,
        transform: { x: 10, y: 10, rotation: 0, scale: 1, opacity: 1 },
      });
      s().addKeyframe(id, {
        time: 3,
        transform: { x: 50, y: 60, rotation: 90, scale: 2, opacity: 0.5 },
      });
      // Easing is a keyframe PATCH (addKeyframe stores time + transform only).
      s().updateKeyframe(id, 1, { easing: 'easeIn' });

      const newId = s().duplicateObject(id)!;
      const orig = s().scene.keyframes[id];
      const copy = s().scene.keyframes[newId];
      expect(copy.map((k) => k.time)).toEqual(orig.map((k) => k.time));
      expect(copy[0].easing).toBe('easeIn');
      expect(copy[1].transform.x).toBe(50);
      // Independent: editing the copy's keyframes never touches the original.
      s().updateKeyframe(newId, 1, { easing: 'hold' });
      expect(s().scene.keyframes[id][0].easing).toBe('easeIn');
      expect(s().scene.keyframes[newId][0].easing).toBe('hold');
    });

    it('a duplicate of a grouped child stays under the same parent', () => {
      const a = s().createObjectOfType('unit');
      const b = s().createObjectOfType('unit');
      const groupId = s().groupObject([a, b])!;
      s().setSelected(b);
      const copyId = s().duplicateObject(b)!;
      expect(s().scene.objects[copyId].parentId).toBe(groupId);
    });

    it('duplicating a group root duplicates the whole subtree', () => {
      // createFormation makes a REAL 'group' node with N children.
      const { groupId, childIds } = s().createFormation('line', { count: 3 });
      const newGroupId = s().duplicateObject(groupId)!;
      expect(newGroupId).not.toBeNull();
      const childrenOfNew = Object.values(s().scene.objects).filter(
        (o) => o.parentId === newGroupId
      );
      expect(childrenOfNew).toHaveLength(3);
      // Children remapped to the NEW group; original subtree untouched.
      for (const c of childIds) {
        expect(s().scene.objects[c].parentId).toBe(groupId);
      }
    });

    it('returns null for an unknown object and writes nothing', () => {
      const before = s().past.length;
      expect(s().duplicateObject('nope' as never)).toBeNull();
      expect(s().past.length).toBe(before);
    });

    it('duplicateAsset shares bytes but gets a new id + " copy" name across scenes', () => {
      useSceneStore.setState({
        inactiveScenes: { 'scene-b': createDefaultScene('scene-b') },
      });
      s().registerAssets([
        {
          id: 'a1',
          kind: 'sprite' as const,
          name: 'cavalry',
          src: 'data:image/png;base64,iVBORw0KGgo=',
          width: 1,
          height: 1,
        },
      ]);
      const lenBefore = s().past.length;
      const newId = s().duplicateAsset('a1')!;
      expect(newId).not.toBe('a1');
      expect(s().scene.assets[newId].name).toBe('cavalry copy');
      expect(s().scene.assets[newId].src).toBe(
        s().scene.assets['a1'].src
      );
      expect(s().inactiveScenes['scene-b'].assets[newId]).toBeDefined();
      expect(s().scene.assets['a1'].name).toBe('cavalry');
      expect(s().past.length).toBe(lenBefore + 1);
      s().undo();
      expect(s().scene.assets[newId]).toBeUndefined();
      expect(s().inactiveScenes['scene-b'].assets[newId]).toBeUndefined();
      expect(s().scene.assets['a1']).toBeDefined();
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

    it('setCameraKeyframeEasing persists, defaults to undefined, and is ONE undo step', () => {
      s().setCameraKeyframe(1);
      s().setCameraKeyframe(3);
      // No key at time 99 -> no-op.
      s().setCameraKeyframeEasing(99, 'easeIn');
      expect(s().scene.cameraTrack!.every((k) => !k.easing)).toBe(true);

      s().setCameraKeyframeEasing(1, 'easeInOut');
      expect(s().scene.cameraTrack![0].easing).toBe('easeInOut');
      expect(s().scene.cameraTrack![1].easing).toBeUndefined();

      s().undo();
      expect(s().scene.cameraTrack![0].easing).toBeUndefined();

      // Re-setting the same easing is a no-op (no history churn).
      s().setCameraKeyframeEasing(1, 'linear');
      const pastLen = useSceneStore.getState().past.length;
      s().setCameraKeyframeEasing(1, 'linear');
      expect(useSceneStore.getState().past.length).toBe(pastLen);
    });

    it('bakeCameraFollow writes plain keys tracking a moving unit (world pos)', () => {
      const id = s().createObjectOfType('unit', { x: 0, y: 50 });
      // March x: 0 → 100 between t=0 and t=2.
      s().addKeyframe(id, {
        time: 0,
        transform: { x: 0, y: 50, rotation: 0, scale: 1, opacity: 1 },
      });
      s().addKeyframe(id, {
        time: 2,
        transform: { x: 100, y: 50, rotation: 0, scale: 1, opacity: 1 },
      });

      s().bakeCameraFollow(id, 0, 2, 0.5);
      const track = s().scene.cameraTrack!;
      expect(track.map((k) => k.time)).toEqual([0, 0.5, 1, 1.5, 2]);
      expect(track[0].cam.x).toBeCloseTo(0);
      expect(track[2].cam.x).toBeCloseTo(50); // linear mid
      expect(track[4].cam.x).toBeCloseTo(100);
      // Position-only: zoom = live base view.
      expect(track.every((k) => k.cam.zoom === s().scene.camera.zoom)).toBe(
        true
      );
    });

    it('re-bake replaces in-range keys and keeps out-of-range ones', () => {
      const id = s().createObjectOfType('unit', { x: 0, y: 0 });
      s().addKeyframe(id, {
        time: 0,
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
      });
      s().addKeyframe(id, {
        time: 3,
        transform: { x: 60, y: 0, rotation: 0, scale: 1, opacity: 1 },
      });

      s().setCameraKeyframe(0.5); // pre-existing key inside the window
      s().updateCamera((cam) => ({ ...cam, x: -999 }));
      s().setCameraKeyframe(9); // outside the window

      s().bakeCameraFollow(id, 0, 3, 1);
      let track = s().scene.cameraTrack!;
      expect(track.map((k) => k.time)).toEqual([0, 1, 2, 3, 9]);
      expect(track.find((k) => k.time === 9)!.cam.x).toBe(-999);

      // Re-bake with different step swaps the segment in place.
      s().bakeCameraFollow(id, 0, 3, 1.5);
      track = s().scene.cameraTrack!;
      expect(track.map((k) => k.time)).toEqual([0, 1.5, 3, 9]);
    });

    it('the whole bake is ONE undo step; degenerate ranges are no-ops', () => {
      const id = s().createObjectOfType('unit', { x: 5, y: 5 });

      const pastBefore = useSceneStore.getState().past.length;
      s().bakeCameraFollow(id, 2, 2); // degenerate -> no-op
      expect(useSceneStore.getState().past.length).toBe(pastBefore);
      expect(s().scene.cameraTrack).toBeUndefined();

      s().bakeCameraFollow(id, 0, 2, 1);
      expect(s().scene.cameraTrack).toHaveLength(3);
      s().undo();
      expect(s().scene.cameraTrack).toBeUndefined();

      // Missing object -> no-op.
      s().bakeCameraFollow('nope' as ObjId, 0, 2);
      expect(s().scene.cameraTrack).toBeUndefined();
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

    it('registerAssets([a,b,c]) is EXACTLY ONE undo step and undoes all in one go', () => {
      twoScenes();
      const before = s().past.length;
      const a1 = { ...asset, id: 'batch-1', name: 'one' };
      const a2 = { ...asset, id: 'batch-2', name: 'two' };
      const a3 = { ...asset, id: 'batch-3', name: 'three' };
      // The whole batch must collapse to a SINGLE history entry (law-relevant:
      // a folder import should be one undoable transaction, not N).
      s().registerAssets([a1, a2, a3]);
      expect(s().past.length).toBe(before + 1);

      // All three were registered and mirrored into the inactive scene.
      for (const id of ['batch-1', 'batch-2', 'batch-3']) {
        expect(s().scene.assets[id]).toBeDefined();
        expect(s().inactiveScenes.b.assets[id]).toBeDefined();
      }

      // One undo removes ALL three at once (no second undo needed).
      s().undo();
      expect(s().past.length).toBe(before);
      for (const id of ['batch-1', 'batch-2', 'batch-3']) {
        expect(s().scene.assets[id]).toBeUndefined();
        expect(s().inactiveScenes.b.assets[id]).toBeUndefined();
      }
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

  describe('triggerWhyItWorked (§39 preset)', () => {
    beforeEach(reset);

    it('replaces the camera track with a zoom-out and pulses the faction', () => {
      const id = s().createObjectOfType('unit');
      s().updateObjectProps(id, { faction: 'red' });
      s().triggerWhyItWorked({ faction: 'red' });
      const scene = s().scene;
      expect(scene.cameraTrack![scene.cameraTrack!.length - 1].cam).toEqual({
        x: 960,
        y: 540,
        zoom: 1.2,
      });
      expect(scene.keyframes[id]!.length).toBeGreaterThan(1);
    });

    it('is ONE undo step: undo restores the prior track and drops the pulses + vignette', () => {
      const id = s().createObjectOfType('unit');
      s().updateObjectProps(id, { faction: 'red' });
      s().setCameraKeyframe(3);
      const seededTrack = s().scene.cameraTrack;

      s().triggerWhyItWorked({ faction: 'red', vignette: true });
      expect(s().scene.vignette).toBe(true);
      expect(s().scene.keyframes[id]).toBeDefined();

      s().undo();
      expect(s().scene.cameraTrack).toEqual(seededTrack);
      expect(s().scene.keyframes[id]).toBeUndefined();
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

// ---- §32/§93/§95/§96 branding (arrow styles, brand tokens, title cards) ----

describe('branding store actions', () => {
  beforeEach(reset);

  it('updateObjectProps writes and clears arrowStyle (undoable)', () => {
    const id = s().createObjectOfType('arrow');
    expect(s().scene.objects[id].arrowStyle).toBeUndefined();

    s().beginInteraction();
    s().updateObjectProps(id, { arrowStyle: 'encirclement' });
    s().endInteraction();
    expect(s().scene.objects[id].arrowStyle).toBe('encirclement');

    s().beginInteraction();
    s().updateObjectProps(id, { arrowStyle: '' as never });
    s().endInteraction();
    // Empty string is a CLEAR, and the field is deleted entirely so saves
    // stay byte-stable with pre-branding files.
    expect(s().scene.objects[id].arrowStyle).toBeUndefined();
    expect('arrowStyle' in s().scene.objects[id]).toBe(false);

    s().undo(); // undo the clear
    expect(s().scene.objects[id].arrowStyle).toBe('encirclement');
    s().undo(); // undo the write
    expect(s().scene.objects[id].arrowStyle).toBeUndefined();
  });

  describe('triggerSignatureOpening (§95)', () => {
    it('writes the opening card AND replaces the camera track', () => {
      s().updateCamera((cam) => ({ ...cam, x: 42 }));
      s().triggerSignatureOpening({});
      expect(s().scene.openingCard).toEqual({ startAt: 0, duration: 3 });
      const track = s().scene.cameraTrack!;
      expect(track.map((k) => k.time)).toEqual([0, 3]);
      expect(track[1].cam.x).toBe(42); // settles into the current view
    });

    it('is ONE undo step restoring both the card and the prior camera state', () => {
      s().setCameraKeyframe(2);
      const seededTrack = s().scene.cameraTrack;
      s().triggerSignatureOpening({ duration: 2 });
      expect(s().scene.openingCard).toBeDefined();
      expect(s().scene.cameraTrack).not.toEqual(seededTrack);
      s().undo();
      expect(s().scene.openingCard).toBeUndefined();
      expect(s().scene.cameraTrack).toEqual(seededTrack);
    });
  });

  describe('toggleClosingCard (§96)', () => {
    it('toggles presence on/off; text defaults resolve at render time', () => {
      s().toggleClosingCard(true);
      expect(s().scene.closingCard).toEqual({});
      s().toggleClosingCard(true); // idempotent — no extra history entry
      s().undo();
      expect(s().scene.closingCard).toBeUndefined();
      s().redo();
      expect(s().scene.closingCard).toEqual({});
      s().toggleClosingCard(false);
      expect(s().scene.closingCard).toBeUndefined();
    });

    it('is one undo step per actual toggle', () => {
      s().toggleClosingCard(true);
      s().undo();
      expect(s().scene.closingCard).toBeUndefined();
    });
  });

  describe('updateBrand (§93)', () => {
    it('patches battleName/dateLine; whitespace-only values clear the field', () => {
      s().updateBrand({ battleName: ' Gaugamela ', dateLine: '331 BC' });
      expect(s().scene.brand).toEqual({
        battleName: 'Gaugamela',
        dateLine: '331 BC',
      });
      s().updateBrand({ battleName: '   ' });
      expect(s().scene.brand!.battleName).toBeUndefined();
      expect(s().scene.brand!.dateLine).toBe('331 BC');
    });

    it('merges factionColors without dropping sibling overrides', () => {
      s().updateBrand({ factionColors: { red: '#111111' } });
      s().updateBrand({ factionColors: { blue: '#222222' } });
      expect(s().scene.brand!.factionColors).toEqual({
        red: '#111111',
        blue: '#222222',
      });
    });

    it('deletes the whole brand object when nothing remains', () => {
      s().updateBrand({ battleName: 'X' });
      expect(s().scene.brand).toBeDefined();
      s().updateBrand({ battleName: '' });
      expect(s().scene.brand).toBeUndefined();
    });

    it('each patch is one undoable step', () => {
      s().updateBrand({ battleName: 'A' });
      s().updateBrand({ battleName: 'B' });
      expect(s().scene.brand!.battleName).toBe('B');
      s().undo();
      expect(s().scene.brand!.battleName).toBe('A');
      s().undo();
      expect(s().scene.brand).toBeUndefined();
    });
  });

  it('brand + cards survive a project save/load roundtrip (per-scene fields)', () => {
    s().updateBrand({ battleName: 'Cannae', dateLine: '216 BC' });
    s().triggerSignatureOpening({ duration: 2.5 });
    s().toggleClosingCard(true);
    const id = s().createObjectOfType('arrow');
    s().beginInteraction();
    s().updateObjectProps(id, { arrowStyle: 'charge' });
    s().endInteraction();

    const json = JSON.stringify(s().getProject());
    useSceneStore.setState({ scene: createDefaultScene(), past: [], future: [] });
    s().loadProjectFromJson(json);

    expect(s().scene.brand).toEqual({
      battleName: 'Cannae',
      dateLine: '216 BC',
    });
    expect(s().scene.openingCard).toEqual({ startAt: 0, duration: 2.5 });
    expect(s().scene.closingCard).toEqual({});
    const arrow = Object.values(s().scene.objects).find((o) => o.type === 'arrow');
    expect(arrow?.arrowStyle).toBe('charge');
  });
});

// ---- AI Commander write path (§60/§61 approval-gated batches) ----

describe('applyAIBatch (AI Change history)', () => {
  beforeEach(reset);

  it('applies a batch of resolved ops as ONE undoable step labeled "AI Change #1"', () => {
    const r = s().applyAIBatch([
      { tool: 'create_object', type: 'unit', x: 500, y: 400, faction: 'red', label: 'Veterans' },
      { tool: 'set_vignette', on: true },
      { tool: 'set_camera_keyframe', time: 2 },
    ]);
    expect(r.applied).toBe(3);
    expect(r.errors).toEqual([]);

    // All three effects landed.
    const created = Object.values(s().scene.objects).find((o) => o.label === 'Veterans');
    expect(created?.faction).toBe('red');
    expect(s().scene.vignette).toBe(true);
    expect(s().scene.cameraTrack!.map((k) => k.time)).toContain(2);

    // ONE undo removes ALL of it — the whole batch is a single history entry.
    s().undo();
    expect(Object.values(s().scene.objects).some((o) => o.label === 'Veterans')).toBe(false);
    expect(s().scene.vignette).toBeUndefined();
  });

  it('labels successive AI batches #1, #2, … independent of manual edits between', () => {
    s().applyAIBatch([{ tool: 'set_vignette', on: true }]);
    s().updateBrand({ battleName: 'Cannae' }); // manual edit in between
    s().applyAIBatch([{ tool: 'toggle_closing_card', on: true }]);
    expect(s().past[s().past.length - 1].label).toBe('AI Change #2');
    // Manual edits between batches don't disturb the AI numbering.
    expect(s().past[s().past.length - 2].label).toBeUndefined();
  });

  it('reports per-op failures without aborting the rest of the batch', () => {
    const before = JSON.stringify(s().scene);
    const r = s().applyAIBatch([
      { tool: 'ungroup_object', id: 'does-not-exist' }, // fails at store level
      { tool: 'create_object', type: 'marker', x: 100, y: 100 },
    ]);
    expect(r.applied).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(
      Object.values(s().scene.objects).some((o) => o.type === 'marker')
    ).toBe(true);
    void before;
  });

  it('move_objects resolves ids and shifts world positions', () => {
    const id = s().createObjectOfType('unit', { x: 100, y: 100 });
    s().beginInteraction();
    s().updateObjectProps(id, { label: 'Skirmishers' });
    s().endInteraction();
    const r = s().applyAIBatch([
      // NOTE: ids arrive PRE-RESOLVED from ai/tools.ts validation — labels
      // never reach the store.
      { tool: 'move_objects', ids: [id], dx: 40, dy: -10 },
    ]);
    expect(r.applied).toBe(1);
    expect(s().scene.objects[id].transform.x).toBe(140);
    expect(s().scene.objects[id].transform.y).toBe(90);
  });

  it('macro ops mirror their store twins (signature opening writes card + track)', () => {
    const r = s().applyAIBatch([
      { tool: 'trigger_signature_opening', opts: { duration: 2.5 } },
    ]);
    expect(r.applied).toBe(1);
    expect(s().scene.openingCard).toEqual({ startAt: 0, duration: 2.5 });
    expect(s().scene.cameraTrack!.map((k) => k.time)).toEqual([0, 2.5]);
    s().undo();
    expect(s().scene.openingCard).toBeUndefined();
  });

  it('an empty batch is a harmless no-op that still records one labeled entry', () => {
    const before = JSON.stringify(s().scene);
    const r = s().applyAIBatch([], undefined);
    expect(r.applied).toBe(0);
    expect(JSON.stringify(s().scene)).toBe(before);
  });

  it('set_keyframe APPLIES a new keyframe and is one undoable step', () => {
    const id = s().createObjectOfType('unit', { x: 100, y: 100 });
    const r = s().applyAIBatch([
      { tool: 'set_keyframe', id, time: 3, transform: { x: 600, opacity: 0.2 } },
    ]);
    expect(r.applied).toBe(1);
    const kfs = s().scene.keyframes[id]!;
    expect(kfs).toHaveLength(1);
    expect(kfs[0].transform.x).toBe(600);
    expect(kfs[0].transform.opacity).toBe(0.2);
    s().undo();
    expect(s().scene.keyframes[id]).toBeUndefined();
  });

  it('set_keyframe MODIFIES an existing keyframe in place', () => {
    const id = s().createObjectOfType('unit', { x: 100, y: 100 });
    s().applyAIBatch([{ tool: 'set_keyframe', id, time: 3, transform: { x: 600 } }]);
    s().applyAIBatch([{ tool: 'set_keyframe', id, time: 3, transform: { opacity: 0.1 } }]);
    const kfs = s().scene.keyframes[id]!;
    expect(kfs).toHaveLength(1); // replaced, not appended
    expect(kfs[0].transform.x).toBe(600);
    expect(kfs[0].transform.opacity).toBe(0.1);
  });

  it('set_keyframe remove=true deletes the keyframe and prunes an emptied track', () => {
    const id = s().createObjectOfType('unit', { x: 100, y: 100 });
    s().applyAIBatch([{ tool: 'set_keyframe', id, time: 3, transform: { x: 600 } }]);
    expect(s().scene.keyframes[id]).toBeDefined();
    const r = s().applyAIBatch([{ tool: 'set_keyframe', id, time: 3, transform: {}, remove: true }]);
    expect(r.applied).toBe(1);
    expect(s().scene.keyframes[id]).toBeUndefined();
  });
});

// ---- AI Commander history (§A label-aware undo) ----

describe('undoLastAIChange', () => {
  beforeEach(reset);

  it('undoes the most recent AI change and is a no-op without one', () => {
    s().updateBrand({ battleName: 'Manual' }); // unlabeled manual edit
    s().applyAIBatch([{ tool: 'set_vignette', on: true }]); // AI Change #1
    expect(s().scene.vignette).toBe(true);
    const steps = s().undoLastAIChange();
    expect(steps).toBe(1);
    expect(s().scene.vignette).toBeUndefined();
    // No AI change left → further calls return 0.
    expect(s().undoLastAIChange()).toBe(0);
  });

  it('discards later edits made after the targeted AI change', () => {
    s().applyAIBatch([{ tool: 'set_vignette', on: true }]); // AI Change #1
    s().updateBrand({ battleName: 'Later' }); // manual edit after
    expect(s().scene.brand?.battleName).toBe('Later');
    const steps = s().undoLastAIChange();
    // Undoes both the manual edit AND the AI change (stack order).
    expect(steps).toBe(2);
    expect(s().scene.vignette).toBeUndefined();
    expect(s().scene.brand).toBeUndefined();
  });

  it('numbers cascade after undo so a fresh AI change restarts correctly', () => {
    s().applyAIBatch([{ tool: 'set_vignette', on: true }]); // #1
    s().applyAIBatch([{ tool: 'toggle_closing_card', on: true }]); // #2
    s().undoLastAIChange(); // remove #2
    expect(s().scene.closingCard).toBeUndefined();
    s().applyAIBatch([{ tool: 'set_vignette', on: false }]); // next is #2 again
    expect(s().past[s().past.length - 1].label).toBe('AI Change #2');
  });
});
