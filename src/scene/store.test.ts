import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from './store';
import { createDefaultScene, DEFAULT_LAYER_ID } from './factory';

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
});
