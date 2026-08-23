import { describe, it, expect } from 'vitest';
import {
  createScene,
  duplicateScene,
  deleteScene,
  serializeProject,
  loadProject,
} from './sceneSystem';
import { PROJECT_SCHEMA_VERSION } from './types';
import type { Scene } from './types';

/** A scene with two layers, two objects and keyframes on one of them. */
function makeRichScene(): Scene {
  const base = createScene({ id: 'scene-a', name: 'Original' });
  base.layers.push({ id: 'layer-2', name: 'Second', visible: true, order: 1 });

  base.objects['obj-1'] = {
    id: 'obj-1',
    type: 'unit',
    transform: { x: 10, y: 20, rotation: 45, scale: 2, opacity: 0.5 },
    layerId: 'layer-root',
  };
  base.objects['obj-2'] = {
    id: 'obj-2',
    type: 'marker',
    transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
    layerId: 'layer-2',
  };
  base.keyframes['obj-1'] = [
    { time: 0, transform: { x: 10, y: 20, rotation: 45, scale: 2, opacity: 0.5 } },
    { time: 60, transform: { x: 100, y: 200, rotation: -90, scale: 1, opacity: 1 } },
  ];
  return base;
}

const unitOf = (scene: Scene) =>
  Object.values(scene.objects).find((o) => o.type === 'unit')!;

describe('createScene', () => {
  it('creates an empty valid scene with a unique id and defaults', () => {
    const a = createScene();
    const b = createScene();
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBeTruthy();
    expect(Object.keys(a.objects)).toHaveLength(0);
    expect(a.layers).toHaveLength(1);
    expect(a.timeline.fps).toBeGreaterThan(0);
  });

  it('accepts an explicit id/name', () => {
    const s = createScene({ id: 'scene-x', name: 'Cannae' });
    expect(s.id).toBe('scene-x');
    expect(s.name).toBe('Cannae');
  });
});

describe('duplicateScene — deep-copies ids', () => {
  it('assigns a NEW scene id and keeps content under new identities', () => {
    const source = makeRichScene();
    const copy = duplicateScene(source);

    expect(copy.id).not.toBe(source.id);
    // Default name derives from the source.
    expect(copy.name).toBe('Original (copy)');

    // No layer id survives unchanged; count preserved.
    expect(copy.layers).toHaveLength(source.layers.length);
    for (const layer of copy.layers) {
      expect(source.layers.map((l) => l.id)).not.toContain(layer.id);
    }

    // No object id survives unchanged; count preserved.
    expect(Object.keys(copy.objects)).toHaveLength(Object.keys(source.objects).length);
    for (const id of Object.keys(copy.objects)) {
      expect(Object.keys(source.objects)).not.toContain(id);
    }
  });

  it('remaps object.layerId onto the COPY’s new layer ids', () => {
    const copy = duplicateScene(makeRichScene());
    const newLayerIds = new Set(copy.layers.map((l) => l.id));
    for (const obj of Object.values(copy.objects)) {
      expect(newLayerIds.has(obj.layerId)).toBe(true);
    }
    // The unit sat on layer-root in the source; its copy points elsewhere.
    const sourceUnit = unitOf(makeRichScene());
    expect(unitOf(copy).layerId).not.toBe(sourceUnit.layerId);
  });

  it('re-keys keyframes onto the new object ids with equal frames', () => {
    const source = makeRichScene();
    const copy = duplicateScene(source);

    const srcUnit = unitOf(source);
    const cpyUnit = unitOf(copy);
    expect(Object.keys(copy.keyframes)).toEqual([cpyUnit.id]);
    expect(copy.keyframes[cpyUnit.id]).toEqual(source.keyframes[srcUnit.id]);
    // Old keys must be gone entirely.
    expect(copy.keyframes[srcUnit.id]).toBeUndefined();
  });

  it('remaps parentId so duplicated hierarchies stay intact', () => {
    const source = makeRichScene();
    // Parent + child; the CHILD is inserted FIRST on purpose (insertion-order
    // trap: the parent mapping must exist before the child resolves it).
    source.objects['child-1'] = {
      id: 'child-1',
      type: 'unit',
      parentId: 'parent-1',
      transform: { x: 5, y: 5, rotation: 0, scale: 1, opacity: 1 },
      layerId: 'layer-root',
    };
    source.objects['parent-1'] = {
      id: 'parent-1',
      type: 'group',
      transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
      layerId: 'layer-root',
    };
    // A dangling parent id must be dropped, not carried over.
    source.objects['orphan-1'] = {
      id: 'orphan-1',
      type: 'marker',
      parentId: 'ghost-parent',
      transform: { x: 1, y: 2, rotation: 0, scale: 1, opacity: 1 },
      layerId: 'layer-root',
    };

    const copy = duplicateScene(source);
    // Deterministic identity of each copy: the group type is unique, the
    // child is the unit pointing at it, the orphan had transform {1,2}.
    const newParent = Object.values(copy.objects).find((o) => o.type === 'group')!;
    expect(newParent.id).not.toBe('parent-1');
    const newChild = Object.values(copy.objects).find(
      (o) => o.parentId === newParent.id
    )!;
    expect(newChild).toBeTruthy();
    const newOrphan = Object.values(copy.objects).find(
      (o) => o.transform.x === 1 && o.transform.y === 2
    )!;
    expect(newOrphan).toBeTruthy();

    // Child follows its parent's NEW id.
    expect(newChild.parentId).toBe(newParent.id);
    // Dangling parent link is dropped entirely.
    expect(newOrphan.parentId).toBeUndefined();
    // Source is untouched.
    expect(source.objects['child-1'].parentId).toBe('parent-1');
  });

  it('is independent: mutating the copy never touches the source', () => {
    const source = makeRichScene();
    const before = JSON.stringify(source);
    const copy = duplicateScene(source);

    unitOf(copy).transform.x = 9999;
    copy.layers[0].name = 'hacked';
    copy.camera.zoom = 7;
    copy.keyframes[unitOf(copy).id][0].time = 1234;
    copy.timeline.duration = 99;

    expect(JSON.stringify(source)).toBe(before);
  });

  it('preserves structure values (transforms, camera, timeline)', () => {
    const source = makeRichScene();
    const copy = duplicateScene(source);
    expect(copy.worldSize).toEqual(source.worldSize);
    expect(copy.camera).toEqual(source.camera);
    expect(copy.timeline).toEqual(source.timeline);
    expect(unitOf(copy).transform).toEqual(unitOf(source).transform);
  });

  it('accepts an explicit id/name override', () => {
    const copy = duplicateScene(makeRichScene(), { name: 'Flank' });
    expect(copy.name).toBe('Flank');
    expect(copy.id).not.toBe('scene-a');
  });
});

describe('deleteScene', () => {
  it('FORBIDS deleting the last remaining scene (throws)', () => {
    const scenes = [createScene({ id: 's1' })];
    expect(() => deleteScene(scenes, 's1', 's1')).toThrow(/last remaining/);
  });

  it('deletes an INACTIVE scene and keeps the active one active', () => {
    const scenes = [createScene({ id: 's1' }), createScene({ id: 's2' })];
    const result = deleteScene(scenes, 's1', 's2');
    expect(result.scenes.map((s) => s.id)).toEqual(['s1']);
    expect(result.activeSceneId).toBe('s1');
  });

  it('REASSIGNS the active scene deterministically when the ACTIVE scene is deleted', () => {
    const scenes = [
      createScene({ id: 's1' }),
      createScene({ id: 's2' }),
      createScene({ id: 's3' }),
    ];
    const result = deleteScene(scenes, 's2', 's2')!;
    expect(result.scenes.map((s) => s.id)).toEqual(['s1', 's3']);
    // Falls to the neighbour after the removed slot (clamped at the end).
    expect(result.activeSceneId).toBe('s3');

    // Deleting the FIRST scene reactivates the next one.
    const result2 = deleteScene(scenes, 's1', 's1')!;
    expect(result2.activeSceneId).toBe('s2');
  });

  it('throws on unknown ids', () => {
    const scenes = [createScene({ id: 's1' }), createScene({ id: 's2' })];
    expect(() => deleteScene(scenes, 's1', 'nope')).toThrow(/Unknown scene/);
  });
});

describe('serializeProject → loadProject roundtrip', () => {
  it('roundtrips to a deep-equal project (insertion order preserved)', () => {
    const first = makeRichScene();
    const second = duplicateScene(makeRichScene(), { name: 'Second' });
    const scenes = [first, second];
    const json = JSON.stringify(serializeProject(scenes, second.id), null, 2);
    const loaded = loadProject(json);

    expect(loaded.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(loaded.activeSceneId).toBe(second.id);
    expect(JSON.parse(JSON.stringify(loaded.scenes))).toEqual(
      JSON.parse(JSON.stringify(scenes))
    );
  });

  it('stamps the current schemaVersion', () => {
    const scene = createScene();
    const parsed = JSON.parse(JSON.stringify(serializeProject([scene], scene.id)));
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
  });

  it('refuses to serialize a dangling activeSceneId', () => {
    expect(() => serializeProject([createScene({ id: 's1' })], 'ghost')).toThrow(
      /activeSceneId/
    );
  });
});

describe('loadProject validation', () => {
  const valid = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      scenes: [createScene({ id: 's1' })],
      activeSceneId: 's1',
      ...overrides,
    });

  it('rejects invalid JSON strings', () => {
    expect(() => loadProject('{nope')).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => loadProject(42)).toThrow(/not an object/);
  });

  it('rejects a wrong or missing schemaVersion', () => {
    expect(() =>
      loadProject(valid({ schemaVersion: PROJECT_SCHEMA_VERSION + 1 }))
    ).toThrow(/schemaVersion/);
    expect(() => loadProject('{"scenes":[],"activeSceneId":"x"}')).toThrow(
      /schemaVersion/
    );
  });

  it('rejects an empty scene registry', () => {
    expect(() => loadProject(valid({ scenes: [] }))).toThrow(/non-empty/);
  });

  it('rejects dangling activeSceneId', () => {
    expect(() => loadProject(valid({ activeSceneId: 'ghost' }))).toThrow(
      /activeSceneId/
    );
  });

  it('rejects duplicate scene ids', () => {
    const s = createScene({ id: 'dup' });
    expect(() =>
      loadProject(valid({ scenes: [s, JSON.parse(JSON.stringify(s))] }))
    ).toThrow(/duplicate/);
  });

  it('rejects malformed scenes inside the registry', () => {
    expect(() =>
      loadProject(valid({ scenes: [{ id: 's1' }] }))
    ).toThrow();
    expect(() =>
      loadProject(
        valid({
          scenes: [{ ...JSON.parse(JSON.stringify(createScene())), worldSize: null }],
        })
      )
    ).toThrow(/worldSize/);
  });

  it('accepts already-parsed objects (not just strings)', () => {
    const obj = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      scenes: [createScene({ id: 's1' })],
      activeSceneId: 's1',
    };
    expect(loadProject(obj).activeSceneId).toBe('s1');
  });
});
