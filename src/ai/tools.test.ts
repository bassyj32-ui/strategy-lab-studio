import { describe, it, expect } from 'vitest';
import {
  TOOL_SPECS,
  resolveOp,
  resolveOps,
  resolveTarget,
  type ProposedOp,
} from './tools';
import { createDefaultScene } from '../scene/factory';
import type { Scene } from '../scene/types';

const scene = (): Scene => {
  const s = createDefaultScene();
  s.objects = {};
  s.objects['u1'] = {
    id: 'u1',
    type: 'unit',
    faction: 'red',
    label: 'Hannibal',
    transform: { x: 400, y: 300, rotation: 0, scale: 1, opacity: 1 },
    layerId: s.layers[0].id,
  };
  return s;
};

describe('TOOL_SPECS (§54 controlled surface)', () => {
  it('declares exactly the v1 tool set with unique names + JSON schemas', () => {
    const names = TOOL_SPECS.map((t) => t.name);
    expect(new Set(names).size).toBe(TOOL_SPECS.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'create_object',
        'move_objects',
        'update_object_props',
        'group_objects',
        'create_formation',
        'set_camera_keyframe',
        'apply_camera_preset',
        'trigger_decisive_move',
        'trigger_why_it_worked',
        'trigger_signature_opening',
        'toggle_closing_card',
        'set_vignette',
        'update_brand',
      ])
    );
    for (const spec of TOOL_SPECS) {
      expect(spec.description.length).toBeGreaterThan(10);
      expect(spec.parameters.type).toBe('object');
    }
  });
});

describe('resolveTarget (§62 name resolution)', () => {
  it('prefers id matches and resolves exact labels case-insensitively', () => {
    const s = scene();
    expect(resolveTarget(s, 'u1').id).toBe('u1');
    expect(resolveTarget(s, 'hannibal').id).toBe('u1');
    expect(resolveTarget(s, '  Hannibal  ').id).toBe('u1');
  });

  it('rejects ambiguous labels and unknown refs without throwing', () => {
    const s = scene();
    s.objects.u2 = { ...s.objects.u1, id: 'u2', label: 'Hannibal' };
    const amb = resolveTarget(s, 'Hannibal');
    expect(amb.error).toContain('ambiguous');
    expect(resolveTarget(s, 'ghost').error).toContain('no object');
    expect(resolveTarget(s, '').error).toBeTruthy();
    expect(resolveTarget(s, 42 as never).error).toBeTruthy();
  });
});

describe('resolveOp validation', () => {
  it('creates objects with explicit positions inside the world bounds', () => {
    const r = resolveOp(
      { tool: 'create_object', args: { type: 'unit', x: 800, y: 500, faction: 'blue', label: 'Left Wing' } },
      scene()
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resolved).toMatchObject({
        tool: 'create_object',
        type: 'unit',
        x: 800,
        y: 500,
        faction: 'blue',
        label: 'Left Wing',
      });
    }
  });

  it('rejects out-of-bounds positions with a ±25% margin', () => {
    const r = resolveOp(
      { tool: 'create_object', args: { type: 'unit', x: -1000, y: 100 } },
      scene() // 1920x1080 → margin allows -480..2400 / -270..1350
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('outside the map');
    // Just inside the margin passes.
    expect(
      resolveOp({ tool: 'create_object', args: { type: 'marker', x: -470, y: 0 } }, scene()).ok
    ).toBe(true);
  });

  it('enforces enums and required numbers on create', () => {
    const bad = resolveOp(
      { tool: 'create_object', args: { type: 'dragon', x: 1, y: 2 } },
      scene()
    );
    expect(bad.ok).toBe(false);
    const missingXY = resolveOp({ tool: 'create_object', args: { type: 'unit' } }, scene());
    expect(missingXY.ok).toBe(false);
    const nan = resolveOp(
      { tool: 'create_object', args: { type: 'unit', x: 'far', y: 2 } },
      scene()
    );
    expect(nan.ok).toBe(false);
  });

  it('move by label delta; absolute placement only for a single target', () => {
    const s = scene();
    const delta = resolveOp(
      { tool: 'move_objects', args: { targets: ['Hannibal'], dx: 50, dy: -20 } },
      s
    );
    expect(delta.ok).toBe(true);

    const abs = resolveOp(
      { tool: 'move_objects', args: { targets: ['u1'], x: 900, y: 600 } },
      s
    );
    expect(abs.ok).toBe(true);
    if (abs.ok && abs.resolved.tool === 'move_objects') {
      expect(abs.resolved.x).toBe(900);
      expect(abs.resolved.y).toBe(600);
    }

    // Absolute with two targets is ambiguous → rejected.
    s.objects.u2 = { ...s.objects.u1, id: 'u2' };
    const multiAbs = resolveOp(
      { tool: 'move_objects', args: { targets: ['u1', 'u2'], x: 1, y: 2 } },
      s
    );
    expect(multiAbs.ok).toBe(false);

    // Mixing delta + absolute is rejected.
    const both = resolveOp(
      { tool: 'move_objects', args: { targets: ['u1'], dx: 1, x: 5 } },
      s
    );
    expect(both.ok).toBe(false);

    // Neither is rejected.
    expect(
      resolveOp({ tool: 'move_objects', args: { targets: ['u1'] } }, s).ok
    ).toBe(false);
  });

  it('update props resolves targets and treats "none" as a clear', () => {
    const r = resolveOp(
      {
        tool: 'update_object_props',
        args: { target: 'hannibal', confidence: 'none', effect: 'smoke' },
      },
      scene()
    );
    expect(r.ok).toBe(true);
    if (r.ok && r.resolved.tool === 'update_object_props') {
      expect(r.resolved.id).toBe('u1');
      expect(r.resolved.props.confidence).toBeNull();
      expect(r.resolved.props.effect).toBe('smoke');
    }
    // Bad length range.
    expect(
      resolveOp({ tool: 'update_object_props', args: { target: 'u1', length: 9999 } }, scene()).ok
    ).toBe(false);
    // No properties at all.
    expect(
      resolveOp({ tool: 'update_object_props', args: { target: 'u1' } }, scene()).ok
    ).toBe(false);
  });

  it('grouping needs ≥2 resolvable targets; camera time stays within the timeline', () => {
    expect(
      resolveOp({ tool: 'group_objects', args: { targets: ['u1'] } }, scene()).ok
    ).toBe(false);
    expect(
      resolveOp({ tool: 'group_objects', args: { targets: ['u1', 'ghost'] } }, scene()).ok
    ).toBe(false);

    expect(
      resolveOp({ tool: 'set_camera_keyframe', args: { time: 5 } }, scene()).ok
    ).toBe(true);
    const late = resolveOp({ tool: 'set_camera_keyframe', args: { time: 99 } }, scene());
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toContain('[0,');
  });

  it('macro/brand/flag ops validate their args', () => {
    expect(
      resolveOp({ tool: 'trigger_decisive_move', args: { focusX: 800, vignette: true } }, scene()).ok
    ).toBe(true);
    expect(
      resolveOp({ tool: 'trigger_decisive_move', args: { focusX: 'west' } }, scene()).ok
    ).toBe(false);
    expect(
      resolveOp({ tool: 'apply_camera_preset', args: { kind: 'overview' } }, scene()).ok
    ).toBe(true);
    expect(
      resolveOp({ tool: 'toggle_closing_card', args: {} }, scene()).ok
    ).toBe(false);
    expect(
      resolveOp({ tool: 'update_brand', args: {} }, scene()).ok
    ).toBe(false);
    expect(
      resolveOp({ tool: 'update_brand', args: { battleName: 'Cannae' } }, scene()).ok
    ).toBe(true);
    expect(resolveOp({ tool: 'time_travel' }, scene()).ok).toBe(false); // unknown tool
  });

  it('NEVER throws on garbage input', () => {
    const garbage: ProposedOp[] = [
      { tool: 'create_object', args: null as never },
      { tool: 'move_objects', args: { targets: 7 } },
      { tool: 'update_object_props', args: [] as never },
      { tool: '' },
      { tool: 'create_object', args: { type: 1, x: {}, y: [] } },
    ];
    for (const op of garbage) {
      expect(() => resolveOp(op, scene())).not.toThrow();
    }
  });
});

describe('resolveOps batch gate', () => {
  it('splits a mixed batch into resolved + errors without applying anything', () => {
    const { resolved, errors } = resolveOps(
      [
        { tool: 'create_object', args: { type: 'unit', x: 100, y: 100, faction: 'red' } },
        { tool: 'create_object', args: { type: 'unit', x: 99999, y: 0 } },
        { tool: 'set_vignette', args: { on: true } },
      ],
      scene()
    );
    expect(resolved.map((r) => r.tool)).toEqual(['create_object', 'set_vignette']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('outside the map');
  });
});
