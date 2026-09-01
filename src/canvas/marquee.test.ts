import { describe, expect, it } from 'vitest';
import {
  worldRectFromPoints,
  worldRectContains,
  objectsInWorldRect,
  type WorldRect,
} from './marquee';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';
import { createSceneObject } from '../objects/factory';
import type { Scene } from '../scene/types';

function sceneWithObjects(objs: ReturnType<typeof createSceneObject>[]): Scene {
  const scene = createDefaultScene();
  for (const o of objs) scene.objects[o.id] = o;
  return scene;
}

const unit = (id: string, x: number, y: number) =>
  createSceneObject('unit', { id, layerId: DEFAULT_LAYER_ID, x, y });

const group = (id: string, x: number, y: number) =>
  createSceneObject('group', { id, layerId: DEFAULT_LAYER_ID, x, y });

describe('worldRectFromPoints', () => {
  it('normalizes any drag direction into a min/max rect', () => {
    const r = worldRectFromPoints({ x: 100, y: 80 }, { x: 20, y: 200 });
    expect(r.minX).toBe(20);
    expect(r.maxX).toBe(100);
    expect(r.minY).toBe(80);
    expect(r.maxY).toBe(200);
  });

  it('handles a zero-size (click-sized) drag', () => {
    const r = worldRectFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(r.minX).toBe(5);
    expect(r.maxX).toBe(5);
  });
});

describe('worldRectContains', () => {
  it('is inclusive on all four edges', () => {
    const r: WorldRect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    expect(worldRectContains(r, 0, 0)).toBe(true);
    expect(worldRectContains(r, 100, 100)).toBe(true);
    expect(worldRectContains(r, 50, 50)).toBe(true);
    expect(worldRectContains(r, -0.1, 50)).toBe(false);
    expect(worldRectContains(r, 50, 100.1)).toBe(false);
  });
});

describe('objectsInWorldRect', () => {
  it('selects root objects whose world anchor is inside the rect', () => {
    const scene = sceneWithObjects([
      unit('a', 10, 10),
      unit('b', 300, 300),
      unit('c', 50, 50),
    ]);
    const rect = worldRectFromPoints({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(objectsInWorldRect(scene, rect, 0).sort()).toEqual(['a', 'c']);
  });

  it('returns [] for a degenerate rect (never emitted by real drags)', () => {
    const scene = sceneWithObjects([unit('a', 10, 10)]);
    const rect: WorldRect = { minX: 50, minY: 50, maxX: 10, maxY: 10 };
    expect(objectsInWorldRect(scene, rect, 0)).toEqual([]);
  });

  it('ignores objects on hidden layers', () => {
    const scene = createDefaultScene();
    scene.layers = [
      { id: 'layer-root', name: 'Default', visible: true, order: 0 },
      { id: 'hidden', name: 'Hidden', visible: false, order: 1 },
    ];
    scene.objects['root'] = createSceneObject('unit', {
      id: 'root',
      layerId: 'layer-root',
      x: 10,
      y: 10,
    });
    scene.objects['ghost'] = createSceneObject('unit', {
      id: 'ghost',
      layerId: 'hidden',
      x: 10,
      y: 10,
    });
    const rect = worldRectFromPoints({ x: 0, y: 0 }, { x: 50, y: 50 });
    expect(objectsInWorldRect(scene, rect, 0)).toEqual(['root']);
  });

  it('collapses group members to their GROUP root (drag-as-one law)', () => {
    const scene = sceneWithObjects([
      group('grp', 500, 500),
      unit('m1', 20, 20),
      unit('m2', 30, 30),
      unit('loose', 25, 25),
    ]);
    // Group members have local coords: place them as CHILDREN (parent = grp).
    scene.objects['m1'].parentId = 'grp';
    scene.objects['m2'].parentId = 'grp';
    // World anchors: 500+20 etc. — outside the box. So only 'loose' is hit.
    const rect = worldRectFromPoints({ x: 0, y: 0 }, { x: 50, y: 50 });
    expect(objectsInWorldRect(scene, rect, 0)).toEqual(['loose']);

    // A box AROUND the group's children (children at world 520/530) hits the
    // group root even though the group's own anchor (500,500) is outside it.
    const aroundChildren = worldRectFromPoints({ x: 510, y: 510 }, { x: 540, y: 540 });
    expect(objectsInWorldRect(scene, aroundChildren, 0)).toEqual(['grp']);
  });

  it('resolves animated anchors at the given time, not just base transforms', () => {
    const scene = sceneWithObjects([
      unit('drone', 0, 0),
      unit('camper', 900, 900),
    ]);
    // Drone flies 0 -> 200 over the timeline. Its WORLD anchor at time t
    // follows the interpolation, so box selection must be time-aware.
    scene.keyframes['drone'] = [
      { time: 0, transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 } },
      { time: 10, transform: { x: 200, y: 0, rotation: 0, scale: 1, opacity: 1 } },
    ];
    const rect = worldRectFromPoints({ x: 150, y: -50 }, { x: 250, y: 50 });
    // At t=10 the drone is inside the box; at t=0 it started at the origin.
    expect(objectsInWorldRect(scene, rect, 10)).toEqual(['drone']);
    expect(objectsInWorldRect(scene, rect, 0)).toEqual([]);
  });
});