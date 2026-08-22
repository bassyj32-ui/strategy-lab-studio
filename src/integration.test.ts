import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from './scene/store';
import { createDefaultScene, DEFAULT_LAYER_ID } from './scene/factory';
import { visibleLayersOrdered, objectsForLayer } from './scene/selectors';

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

describe('integration: add -> move -> undo -> redo -> hide -> remove layer', () => {
  beforeEach(reset);

  it('keeps the Scene consistent through the full flow', () => {
    // 1. Add an object of each MVP-1 type.
    const shapeId = s().createObjectOfType('shape');
    s().createObjectOfType('marker');
    expect(Object.keys(s().scene.objects)).toHaveLength(2);

    // 2. Move the shape via a coalesced drag gesture (one undo entry).
    s().beginInteraction();
    s().moveObjectBy(shapeId, 100, 50);
    s().endInteraction();
    expect(s().scene.objects[shapeId].transform).toMatchObject({ x: 100, y: 50 });

    // 3. Undo -> back to origin; redo -> back to moved.
    s().undo();
    expect(s().scene.objects[shapeId].transform).toMatchObject({ x: 0, y: 0 });
    s().redo();
    expect(s().scene.objects[shapeId].transform).toMatchObject({ x: 100, y: 50 });

    // 4. Add a layer, put an object in it, hide the layer -> object hidden.
    s().addLayer('Hidden');
    const hidden = s().scene.layers.find((l) => l.name === 'Hidden')!;
    s().setActiveLayer(hidden.id);
    const hiddenObjId = s().createObjectOfType('marker');
    expect(s().scene.objects[hiddenObjId].layerId).toBe(hidden.id);

    s().toggleLayerVisible(hidden.id);
    const visibleLayerIds = visibleLayersOrdered(s().scene).map((l) => l.id);
    expect(visibleLayerIds).not.toContain(hidden.id);
    const visibleObjects = visibleLayersOrdered(s().scene).flatMap((layer) =>
      objectsForLayer(s().scene, layer.id)
    );
    expect(visibleObjects.find((o) => o.id === hiddenObjId)).toBeUndefined();

    // 5. Remove the hidden layer -> its object is reassigned, never orphaned.
    s().removeLayer(hidden.id);
    expect(s().scene.layers.find((l) => l.id === hidden.id)).toBeUndefined();
    expect(s().scene.objects[hiddenObjId].layerId).toBe(DEFAULT_LAYER_ID);
    expect(
      Object.values(s().scene.objects).every((o) => o.layerId !== hidden.id)
    ).toBe(true);
  });

  it('undo restores the whole scene and redo re-applies it', () => {
    const shapeId = s().createObjectOfType('shape');
    s().beginInteraction();
    s().moveObjectBy(shapeId, 30, 0);
    s().endInteraction();
    s().addLayer('Second');

    const beforeUndo = JSON.stringify(s().scene);
    s().undo(); // undo addLayer
    s().undo(); // undo move
    s().undo(); // undo create shape
    expect(Object.keys(s().scene.objects)).toHaveLength(0);
    expect(s().scene.layers).toHaveLength(1);

    s().redo(); // redo create
    s().redo(); // redo move
    s().redo(); // redo addLayer
    expect(JSON.stringify(s().scene)).toBe(beforeUndo);
  });
});
