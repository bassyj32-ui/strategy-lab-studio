import { describe, expect, it } from 'vitest';
import type { SceneObject, Transform } from '../scene/types';
import {
  ancestors,
  canReparent,
  composeTransform,
  descendants,
  directChildren,
  formationOffsets,
  resolveWorldTransform,
  wouldCreateCycle,
  worldDeltaToLocal,
  worldPointToLocal,
} from './groups';

function obj(
  id: string,
  transform: Partial<Transform> = {},
  parentId?: string
): SceneObject {
  return {
    id,
    type: 'unit',
    transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, ...transform },
    layerId: 'layer_1',
    ...(parentId ? { parentId } : {}),
  };
}

describe('composeTransform', () => {
  it('translates and scales a local point into the parent frame', () => {
    const parent: Transform = { x: 100, y: 50, rotation: 0, scale: 2, opacity: 1 };
    const out = composeTransform(parent, { x: 10, y: -5, rotation: 0, scale: 1, opacity: 1 });
    expect(out.x).toBe(120);
    expect(out.y).toBe(40);
    expect(out.scale).toBe(2);
  });

  it('rotates the local offset (degrees)', () => {
    // Parent at origin rotated +90°: local +X maps to world +Y.
    const parent: Transform = { x: 0, y: 0, rotation: 90, scale: 1, opacity: 1 };
    const out = composeTransform(parent, { x: 10, y: 0, rotation: 45, scale: 1, opacity: 1 });
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(10);
    expect(out.rotation).toBe(135);
  });

  it('multiplies opacity', () => {
    const parent: Transform = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 0.5 };
    const out = composeTransform(parent, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 0.4 });
    expect(out.opacity).toBeCloseTo(0.2);
  });
});

describe('worldPointToLocal / worldDeltaToLocal', () => {
  it('inverts composeTransform for points', () => {
    const parent: Transform = { x: 100, y: 50, rotation: 30, scale: 2, opacity: 1 };
    const local = { x: 7, y: -3 };
    const world = composeTransform(parent, { ...local, rotation: 0, scale: 1, opacity: 1 });
    const back = worldPointToLocal(parent, world.x, world.y);
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
  });

  it('ignores translation for deltas', () => {
    const parent: Transform = { x: 500, y: 500, rotation: 90, scale: 2, opacity: 1 };
    // World delta +X on a +90°-rotated parent is a LOCAL -Y... actually
    // R(-90)·(1,0) = (0,-1), then divided by scale.
    const d = worldDeltaToLocal(parent, 2, 0);
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(-1);
  });
});

describe('hierarchy queries', () => {
  const objects: Record<string, SceneObject> = {
    root: obj('root'),
    mid: obj('mid', {}, 'root'),
    leaf: obj('leaf', {}, 'mid'),
    other: obj('other'),
  };

  it('ancestors returns root → … → direct parent', () => {
    expect(ancestors(objects, 'leaf')).toEqual(['root', 'mid']);
    expect(ancestors(objects, 'mid')).toEqual(['root']);
    expect(ancestors(objects, 'root')).toEqual([]);
  });

  it('ancestors survives a corrupted cycle instead of hanging', () => {
    const bad: Record<string, SceneObject> = {
      a: obj('a', {}, 'b'),
      b: obj('b', {}, 'a'),
    };
    expect(() => ancestors(bad, 'a')).not.toThrow();
    expect(ancestors(bad, 'a')).toEqual(['b']);
  });

  it('directChildren / descendants are deterministic and complete', () => {
    expect(directChildren(objects, 'root').map((o) => o.id)).toEqual(['mid']);
    expect(descendants(objects, 'root').map((o) => o.id)).toEqual(['mid', 'leaf']);
  });

  it('wouldCreateCycle blocks self, descendant and identity targets', () => {
    expect(wouldCreateCycle(objects, 'root', 'leaf')).toBe(true); // descendant
    expect(wouldCreateCycle(objects, 'root', 'root')).toBe(true); // self
    expect(wouldCreateCycle(objects, 'root', 'other')).toBe(false);
    expect(wouldCreateCycle(objects, 'root', null)).toBe(false);
  });

  it('canReparent requires an existing target', () => {
    expect(canReparent(objects, 'other', 'missing')).toBe(false);
    expect(canReparent(objects, 'other', null)).toBe(true);
    expect(canReparent(objects, 'root', 'leaf')).toBe(false);
    expect(canReparent(objects, 'other', 'root')).toBe(true);
  });
});

describe('resolveWorldTransform', () => {
  it('returns the object transform unchanged for roots', () => {
    const objects = { r: obj('r', { x: 12, y: 34 }) };
    expect(resolveWorldTransform(objects, 'r')).toMatchObject({ x: 12, y: 34 });
  });

  it('folds the full chain parent → child', () => {
    const objects: Record<string, SceneObject> = {
      p: obj('p', { x: 100, y: 0, rotation: 90, scale: 2 }),
      c: obj('c', { x: 5, y: 0 }, 'p'),
      g: obj('g', { x: 1, y: 1, scale: 2 }, 'c'),
    };
    // c world: rotate (5,0) by 90° → (0,5), ×2 → (0,10) + (100,0).
    const cw = resolveWorldTransform(objects, 'c');
    expect(cw.x).toBeCloseTo(100);
    expect(cw.y).toBeCloseTo(10);
    expect(cw.rotation).toBe(90);
    expect(cw.scale).toBeCloseTo(2);
    // g world folds through both levels.
    const gw = resolveWorldTransform(objects, 'g');
    expect(gw.scale).toBeCloseTo(4);
  });
});

describe('formationOffsets', () => {
  it('yields exactly count offsets; line/column center on the anchor', () => {
    for (const pattern of ['line', 'column'] as const) {
      const offs = formationOffsets(pattern, 5, 40);
      expect(offs).toHaveLength(5);
      const cx = offs.reduce((m, o) => m + o.x, 0) / offs.length;
      const cy = offs.reduce((m, o) => m + o.y, 0) / offs.length;
      expect(cx).toBeCloseTo(0);
      expect(cy).toBeCloseTo(0);
    }
    // Grid is covered by its own block-shape test below.
    expect(formationOffsets('grid', 5, 40)).toHaveLength(5);
    // Wedge keeps its APEX at the anchor instead of centring.
    expect(formationOffsets('wedge', 5, 40)[0]).toEqual({ x: 0, y: 0 });
  });

  it('line spreads horizontally centered on the anchor', () => {
    const offs = formationOffsets('line', 3, 10);
    expect(offs.map((o) => o.x)).toEqual([-10, 0, 10]);
    expect(offs.every((o) => o.y === 0)).toBe(true);
  });

  it('column spreads vertically centered on the anchor', () => {
    const offs = formationOffsets('column', 3, 10);
    expect(offs.map((o) => o.y)).toEqual([-10, 0, 10]);
    expect(offs.every((o) => o.x === 0)).toBe(true);
  });

  it('wedge opens backward with symmetric ranks', () => {
    const offs = formationOffsets('wedge', 5, 20);
    // apex, L1, R1, L2, R2
    expect(offs[1]).toEqual({ x: -20, y: -20 });
    expect(offs[2]).toEqual({ x: -20, y: 20 });
    expect(offs[3]).toEqual({ x: -40, y: -40 });
    expect(offs[4]).toEqual({ x: -40, y: 40 });
  });

  it('grid fills a near-square block', () => {
    const offs = formationOffsets('grid', 4, 10);
    expect(offs).toHaveLength(4);
    const xs = new Set(offs.map((o) => o.x));
    const ys = new Set(offs.map((o) => o.y));
    expect(xs.size).toBe(2);
    expect(ys.size).toBe(2);
  });

  it('handles zero and negative counts gracefully', () => {
    expect(formationOffsets('line', 0, 10)).toEqual([]);
    expect(formationOffsets('grid', -2, 10)).toEqual([]);
  });
});
