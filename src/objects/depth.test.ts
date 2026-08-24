import { describe, it, expect } from 'vitest';
import { sortForRender, nextZAbove, nextZBelow } from './depth';
import type { SceneObject } from '../scene/types';

const obj = (id: string, over: Partial<SceneObject> = {}): SceneObject => ({
  id,
  type: 'marker',
  layerId: 'L1',
  transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
  ...over,
});

describe('depth ordering (§48)', () => {
  it('keeps stable insertion order when all z are absent', () => {
    const objs = [obj('a'), obj('b'), obj('c')];
    expect(sortForRender(objs).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('paints higher z later; ties keep insertion order', () => {
    const objs = [obj('low', { z: 0 }), obj('high', { z: 5 }), obj('tieA', { z: 2 }), obj('tieB', { z: 2 })];
    expect(sortForRender(objs).map((o) => o.id)).toEqual(['low', 'tieA', 'tieB', 'high']);
  });

  it('nextZAbove stacks above the highest sibling in the layer', () => {
    const objs = [
      obj('me', { z: 3 }),
      obj('other', { z: 7, layerId: 'L1' }),
      obj('elsewhere', { z: 99, layerId: 'L2' }),
    ];
    expect(nextZAbove(objs, 'L1', 'me')).toBe(8);
  });

  it('nextZAbove returns 1 on an empty sibling set', () => {
    expect(nextZAbove([obj('only')], 'L1', 'only')).toBe(1);
  });

  it('nextZBelow goes under the lowest sibling (-1 when alone)', () => {
    const objs = [
      obj('me', { z: 3 }),
      obj('floor', { z: -2, layerId: 'L1' }),
      obj('elsewhere', { z: -99, layerId: 'L2' }),
    ];
    expect(nextZBelow(objs, 'L1', 'me')).toBe(-3);
    expect(nextZBelow([obj('alone')], 'L1', 'alone')).toBe(-1);
  });
});
