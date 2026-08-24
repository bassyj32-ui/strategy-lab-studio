// §54 CONTROLLED TOOL SURFACE + §62 NAME RESOLUTION for the AI Commander.
// Pure module: no store, no React, no network. The provider proposes ops as
// JSON; THIS layer validates them against schema + bounds BEFORE anything
// touches the scene (invalid proposals are rejected harmlessly). Approved
// batches are applied by the store's applyAIBatch as ONE undoable transaction.
import type {
  ArrowStyle,
  ConfidenceLevel,
  EffectKind,
  Faction,
  FormationPattern,
  ObjId,
  Scene,
  SceneObjectType,
  Transform,
} from '../scene/types';

/** A raw op proposed by the AI provider (unvalidated). */
export interface ProposedOp {
  tool: string;
  args?: Record<string, unknown>;
}

/** A JSON-Schema fragment describing one tool for the provider (§54). */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const FACTIONS: Faction[] = ['red', 'blue', 'neutral'];
const ARROW_STYLES: ArrowStyle[] = [
  'attack',
  'flank',
  'retreat',
  'encirclement',
  'movement',
  'charge',
];
const EFFECTS: EffectKind[] = ['smoke', 'dust', 'impact', 'fire', 'glow'];
const CONFIDENCE: ConfidenceLevel[] = ['confirmed', 'probable', 'disputed'];
const PATTERNS: FormationPattern[] = ['line', 'column', 'wedge', 'grid'];
const CREATE_TYPES: SceneObjectType[] = ['unit', 'marker', 'shape'];

const obj = (
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const str = { type: 'string' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const en = (values: readonly string[]) => ({ type: 'string', enum: values });

/**
 * The v1 tool surface. Deliberately maps 1:1 onto existing store actions and
 * macro builders so AI edits are ordinary, independently editable scene data.
 */
export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'create_object',
    description:
      'Create a battlefield object (unit/marker/shape) at an explicit world position.',
    parameters: obj(
      {
        type: en(CREATE_TYPES),
        x: num,
        y: num,
        faction: { ...en(FACTIONS), description: 'Assigns the army/faction ring.' },
        label: { ...str, description: 'Display name, e.g. "Hannibal" or "Left Wing".' },
      },
      ['type', 'x', 'y']
    ),
  },
  {
    name: 'move_objects',
    description:
      'Move one or more objects by a delta, or place ONE object at an absolute world position.',
    parameters: obj({
      targets: {
        type: 'array',
        items: str,
        minItems: 1,
        description: 'Object ids OR exact display labels from the scene summary.',
      },
      dx: num,
      dy: num,
      x: { ...num, description: 'Absolute target X (single target only).' },
      y: { ...num, description: 'Absolute target Y (single target only).' },
    }, ['targets']),
  },
  {
    name: 'update_object_props',
    description:
      'Patch non-transform properties of one object (label, faction, confidence badge, effect, arrow style, arrow length/color, z-order).',
    parameters: obj({
      target: { ...str, description: 'Object id OR exact display label.' },
      label: str,
      faction: en(FACTIONS),
      confidence: { ...en(CONFIDENCE), description: '"none" removes the badge.' },
      effect: { ...en(EFFECTS), description: '"none" removes the effect.' },
      arrowStyle: en(ARROW_STYLES),
      length: num,
      z: { oneOf: [num, { ...str, enum: ['none'] }] },
    }, ['target']),
  },
  {
    name: 'group_objects',
    description:
      'Organize 2+ objects under one group parent so they can be moved/keyframed together.',
    parameters: obj(
      { targets: { type: 'array', items: str, minItems: 2 } },
      ['targets']
    ),
  },
  {
    name: 'ungroup_object',
    description: 'Dissolve a group; its members survive as independent objects.',
    parameters: obj({ target: str }, ['target']),
  },
  {
    name: 'create_formation',
    description:
      'Spawn a formation group (line/column/wedge/grid) of fresh units at a world position.',
    parameters: obj(
      {
        pattern: en(PATTERNS),
        x: num,
        y: num,
        count: { ...num, description: 'Integer member count (1-100).' },
        spacing: { ...num, description: 'Gap between members in world units.' },
        faction: en(FACTIONS),
      },
      ['pattern', 'x', 'y']
    ),
  },
  {
    name: 'set_camera_keyframe',
    description:
      'Pin the CURRENT camera view as a keyframe at an explicit timeline time.',
    parameters: obj({ time: num }, ['time']),
  },
  {
    name: 'apply_camera_preset',
    description:
      'Replace the camera track with a named preset (overview/tactical/flank-follow/commander-focus).',
    parameters: obj(
      {
        kind: en(['overview', 'tactical', 'flank-follow', 'commander-focus']),
        focusX: num,
        focusY: num,
      },
      ['kind']
    ),
  },
  {
    name: 'trigger_decisive_move',
    description:
      '§38 cinematic macro: push-in onto a focus with highlight marker + optional pulse.',
    parameters: obj({
      focusX: num,
      focusY: num,
      startAt: num,
      duration: num,
      zoom: num,
      vignette: bool,
    }),
  },
  {
    name: 'trigger_why_it_worked',
    description:
      '§39 cinematic macro: zoom-out to overview + gentle opacity pulse of one army.',
    parameters: obj({ faction: en(FACTIONS), vignette: bool }),
  },
  {
    name: 'trigger_signature_opening',
    description: '§95 branding macro: title card + hold-wide-then-settle camera move.',
    parameters: obj({ duration: num }),
  },
  {
    name: 'toggle_closing_card',
    description: '§96 enable/disable the closing "THE LESSON" title card.',
    parameters: obj({ on: bool }, ['on']),
  },
  {
    name: 'set_vignette',
    description: 'Enable/disable the cinematic edge-darkening vignette flag.',
    parameters: obj({ on: bool }, ['on']),
  },
  {
    name: 'update_brand',
    description: 'Set per-scene brand metadata (battle name / date line) for title cards.',
    parameters: obj({ battleName: str, dateLine: str }),
  },
  {
    name: 'set_keyframe',
    description:
      'Set or replace an animation keyframe for one object at an explicit timeline time ' +
      '(x/y/rotation/scale/opacity). A keyframe already at that time is MODIFIED; otherwise ' +
      'a new one is APPLIED. Set remove=true to delete a keyframe. Explicit times only.',
    parameters: obj(
      {
        target: { ...str, description: 'Object id OR exact display label.' },
        time: num,
        x: num,
        y: num,
        rotation: num,
        scale: num,
        opacity: { ...num, description: '0..1' },
        remove: { ...bool, description: 'Delete the keyframe at `time` instead of writing one.' },
      },
      ['target', 'time']
    ),
  },
];

// ---------------------------------------------------------------------------
// Resolution + validation
// ---------------------------------------------------------------------------

export type ResolveResult =
  | { ok: true; resolved: ResolvedOp; summary: string }
  | { ok: false; error: string };

export type ResolvedOp =
  | {
      tool: 'create_object';
      type: SceneObjectType;
      x: number;
      y: number;
      faction?: Faction;
      label?: string;
    }
  | {
      tool: 'move_objects';
      ids: ObjId[];
      dx?: number;
      dy?: number;
      x?: number;
      y?: number;
    }
  | {
      tool: 'update_object_props';
      id: ObjId;
      props: {
        label?: string;
        faction?: Faction;
        confidence?: ConfidenceLevel | null;
        effect?: EffectKind | null;
        arrowStyle?: ArrowStyle;
        length?: number;
        z?: number | null;
      };
    }
  | { tool: 'group_objects'; ids: ObjId[] }
  | { tool: 'ungroup_object'; id: ObjId }
  | {
      tool: 'create_formation';
      pattern: FormationPattern;
      x: number;
      y: number;
      count?: number;
      spacing?: number;
      faction?: Faction;
    }
  | { tool: 'set_camera_keyframe'; time: number }
  | {
      tool: 'apply_camera_preset';
      kind: 'overview' | 'tactical' | 'flank-follow' | 'commander-focus';
      focus?: { x: number; y: number };
    }
  | {
      tool: 'trigger_decisive_move';
      opts: {
        focus?: { x: number; y: number };
        startAt?: number;
        duration?: number;
        zoom?: number;
        vignette?: boolean;
      };
    }
  | {
      tool: 'trigger_why_it_worked';
      opts: { faction?: Faction; vignette?: boolean };
    }
  | { tool: 'trigger_signature_opening'; opts: { duration?: number } }
  | { tool: 'toggle_closing_card'; on: boolean }
  | { tool: 'set_vignette'; on: boolean }
  | { tool: 'update_brand'; battleName?: string; dateLine?: string }
  | {
      tool: 'set_keyframe';
      id: ObjId;
      time: number;
      transform: Partial<Transform>;
      remove?: boolean;
    };

const isFiniteNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function fail(error: string): ResolveResult {
  return { ok: false, error };
}

function optNum(
  args: Record<string, unknown>,
  key: string
): { value?: number } | { error: string } {
  const v = args[key];
  if (v === undefined) return {};
  if (!isFiniteNum(v)) return { error: `${key} must be a finite number` };
  return { value: v };
}

function optBool(
  args: Record<string, unknown>,
  key: string
): { value?: boolean } | { error: string } {
  const v = args[key];
  if (v === undefined) return {};
  if (typeof v !== 'boolean') return { error: `${key} must be a boolean` };
  return { value: v };
}

function optEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  values: readonly T[]
): { value?: T } | { error: string } {
  const v = args[key];
  if (v === undefined) return {};
  if (typeof v !== 'string' || !values.includes(v as T)) {
    return { error: `${key} must be one of: ${values.join(', ')}` };
  }
  return { value: v as T };
}

/**
 * §62 name resolution: a target reference is an object id OR an exact display
 * label (case-insensitive, matching the labels shown in the scene summary).
 * Ambiguous label matches are rejected rather than guessed.
 */
export function resolveTarget(
  scene: Scene,
  ref: unknown
): { id?: ObjId; error?: string } {
  if (typeof ref !== 'string' || !ref.trim()) {
    return { error: 'target must be a non-empty id or label string' };
  }
  const objects = Object.values(scene.objects);
  if (objects.some((o) => o.id === ref)) return { id: ref };
  const needle = ref.trim().toLowerCase();
  const byLabel = objects.filter(
    (o) => o.label && o.label.toLowerCase() === needle
  );
  if (byLabel.length === 1) return { id: byLabel[0].id };
  if (byLabel.length > 1) {
    return { error: `ambiguous label "${ref}" matches ${byLabel.length} objects` };
  }
  return { error: `no object with id or label "${ref}"` };
}

function inBounds(scene: Scene, x: number, y: number): boolean {
  const m = scene.worldSize;
  // Generous margin: formations/arrows may legitimately sit slightly off-map.
  return x >= -m.w * 0.25 && x <= m.w * 1.25 && y >= -m.h * 0.25 && y <= m.h * 1.25;
}

function point(
  args: Record<string, unknown>,
  xKey: string,
  yKey: string
): { x?: number; y?: number; error?: string } {
  const x = optNum(args, xKey);
  if ('error' in x) return { error: x.error };
  const y = optNum(args, yKey);
  if ('error' in y) return { error: y.error };
  return { x: x.value, y: y.value };
}

/** Validate ONE proposed op against the current scene. Never throws. */
export function resolveOp(op: ProposedOp, scene: Scene): ResolveResult {
  const args = op.args ?? {};
  switch (op.tool) {
    case 'create_object': {
      const type = optEnum(args, 'type', CREATE_TYPES);
      if ('error' in type) return fail(type.error);
      if (!type.value) return fail('type is required');
      const x = optNum(args, 'x');
      if ('error' in x) return fail(x.error);
      const y = optNum(args, 'y');
      if ('error' in y) return fail(y.error);
      if (x.value === undefined || y.value === undefined) {
        return fail('x and y are required');
      }
      if (!inBounds(scene, x.value, y.value)) {
        return fail(`position (${x.value}, ${y.value}) is outside the map`);
      }
      const faction = optEnum(args, 'faction', FACTIONS);
      if ('error' in faction) return fail(faction.error);
      const label = args.label === undefined ? undefined : String(args.label);
      return {
        ok: true,
        resolved: {
          tool: 'create_object',
          type: type.value,
          x: x.value,
          y: y.value,
          ...(faction.value ? { faction: faction.value } : {}),
          ...(label ? { label } : {}),
        },
        summary: `create ${type.value}${label ? ` "${label}"` : ''} at (${x.value}, ${y.value})`,
      };
    }
    case 'move_objects': {
      const refs = args.targets;
      if (!Array.isArray(refs) || refs.length === 0) {
        return fail('targets must be a non-empty array');
      }
      const ids: ObjId[] = [];
      for (const ref of refs) {
        const t = resolveTarget(scene, ref);
        if (t.error) return fail(t.error);
        ids.push(t.id!);
      }
      let hasDelta = false;
      let hasAbs = false;
      const out: Extract<ResolvedOp, { tool: 'move_objects' }> = {
        tool: 'move_objects',
        ids,
      };
      const dx = optNum(args, 'dx');
      if ('error' in dx) return fail(dx.error);
      const dy = optNum(args, 'dy');
      if ('error' in dy) return fail(dy.error);
      if (dx.value !== undefined || dy.value !== undefined) {
        out.dx = dx.value ?? 0;
        out.dy = dy.value ?? 0;
        hasDelta = true;
      }
      const abs = point(args, 'x', 'y');
      if (abs.error) return fail(abs.error);
      if (abs.x !== undefined || abs.y !== undefined) {
        if (ids.length > 1) return fail('absolute x/y requires exactly one target');
        if (hasDelta) return fail('use either delta (dx/dy) or absolute (x/y), not both');
        const target = scene.objects[ids[0]];
        out.x = abs.x ?? target.transform.x;
        out.y = abs.y ?? target.transform.y;
        if (!inBounds(scene, out.x, out.y)) return fail('absolute position is outside the map');
        hasAbs = true;
      }
      if (!hasDelta && !hasAbs) return fail('provide dx/dy or absolute x/y');
      return {
        ok: true,
        resolved: out,
        summary: `move ${ids.length} object(s)`,
      };
    }
    case 'update_object_props': {
      const t = resolveTarget(scene, args.target);
      if (t.error) return fail(t.error);
      const props: Extract<ResolvedOp, { tool: 'update_object_props' }>['props'] = {};
      if (args.label !== undefined) props.label = String(args.label);
      const faction = optEnum(args, 'faction', FACTIONS);
      if ('error' in faction) return fail(faction.error);
      if (faction.value) props.faction = faction.value;
      if (args.confidence !== undefined) {
        if (args.confidence === 'none') props.confidence = null;
        else {
          const c = optEnum(args, 'confidence', CONFIDENCE);
          if ('error' in c) return fail(c.error);
          if (c.value) props.confidence = c.value;
        }
      }
      if (args.effect !== undefined) {
        if (args.effect === 'none') props.effect = null;
        else {
          const e = optEnum(args, 'effect', EFFECTS);
          if ('error' in e) return fail(e.error);
          if (e.value) props.effect = e.value;
        }
      }
      const style = optEnum(args, 'arrowStyle', ARROW_STYLES);
      if ('error' in style) return fail(style.error);
      if (style.value) props.arrowStyle = style.value;
      const len = optNum(args, 'length');
      if ('error' in len) return fail(len.error);
      if (len.value !== undefined) {
        if (len.value <= 0 || len.value > 5000) return fail('length must be within (0, 5000]');
        props.length = len.value;
      }
      if (args.z !== undefined) {
        if (args.z === 'none') props.z = null;
        else {
          const z = optNum(args, 'z');
          if ('error' in z) return fail(z.error);
          props.z = z.value!;
        }
      }
      if (Object.keys(props).length === 0) return fail('no properties to update');
      return {
        ok: true,
        resolved: { tool: 'update_object_props', id: t.id!, props },
        summary: `update ${scene.objects[t.id!]?.label ?? t.id}`,
      };
    }
    case 'group_objects': {
      const refs = args.targets;
      if (!Array.isArray(refs) || refs.length < 2) {
        return fail('group_objects needs at least 2 targets');
      }
      const ids: ObjId[] = [];
      for (const ref of refs) {
        const t = resolveTarget(scene, ref);
        if (t.error) return fail(t.error);
        ids.push(t.id!);
      }
      return {
        ok: true,
        resolved: { tool: 'group_objects', ids },
        summary: `group ${ids.length} objects`,
      };
    }
    case 'ungroup_object': {
      const t = resolveTarget(scene, args.target);
      if (t.error) return fail(t.error);
      return {
        ok: true,
        resolved: { tool: 'ungroup_object', id: t.id! },
        summary: 'ungroup',
      };
    }
    case 'create_formation': {
      const pattern = optEnum(args, 'pattern', PATTERNS);
      if ('error' in pattern) return fail(pattern.error);
      if (!pattern.value) return fail('pattern is required');
      const pos = point(args, 'x', 'y');
      if (pos.error) return fail(pos.error);
      if (pos.x === undefined || pos.y === undefined) {
        return fail('x and y are required');
      }
      if (!inBounds(scene, pos.x, pos.y)) return fail('formation centre is outside the map');
      const count = optNum(args, 'count');
      if ('error' in count) return fail(count.error);
      if (count.value !== undefined && (count.value < 1 || count.value > 100)) {
        return fail('count must be between 1 and 100');
      }
      const spacing = optNum(args, 'spacing');
      if ('error' in spacing) return fail(spacing.error);
      const faction = optEnum(args, 'faction', FACTIONS);
      if ('error' in faction) return fail(faction.error);
      return {
        ok: true,
        resolved: {
          tool: 'create_formation',
          pattern: pattern.value,
          x: pos.x,
          y: pos.y,
          ...(count.value !== undefined ? { count: Math.floor(count.value) } : {}),
          ...(spacing.value !== undefined ? { spacing: spacing.value } : {}),
          ...(faction.value ? { faction: faction.value } : {}),
        },
        summary: `${pattern.value} formation (${count.value ?? 5}) at (${pos.x}, ${pos.y})`,
      };
    }
    case 'set_camera_keyframe': {
      const time = optNum(args, 'time');
      if ('error' in time) return fail(time.error);
      if (time.value === undefined) return fail('time is required');
      if (time.value < 0 || time.value > scene.timeline.duration) {
        return fail(`time must be within [0, ${scene.timeline.duration}]`);
      }
      return {
        ok: true,
        resolved: { tool: 'set_camera_keyframe', time: time.value },
        summary: `camera keyframe @ ${time.value}s`,
      };
    }
    case 'apply_camera_preset': {
      const kind = optEnum(args, 'kind', [
        'overview',
        'tactical',
        'flank-follow',
        'commander-focus',
      ]);
      if ('error' in kind) return fail(kind.error);
      if (!kind.value) return fail('kind is required');
      const fx = optNum(args, 'focusX');
      if ('error' in fx) return fail(fx.error);
      const fy = optNum(args, 'focusY');
      if ('error' in fy) return fail(fy.error);
      return {
        ok: true,
        resolved: {
          tool: 'apply_camera_preset',
          kind: kind.value,
          ...(fx.value !== undefined && fy.value !== undefined
            ? { focus: { x: fx.value, y: fy.value } }
            : {}),
        },
        summary: `${kind.value} camera preset`,
      };
    }
    case 'trigger_decisive_move': {
      const pos = point(args, 'focusX', 'focusY');
      if (pos.error) return fail(pos.error);
      const startAt = optNum(args, 'startAt');
      if ('error' in startAt) return fail(startAt.error);
      const duration = optNum(args, 'duration');
      if ('error' in duration) return fail(duration.error);
      const zoom = optNum(args, 'zoom');
      if ('error' in zoom) return fail(zoom.error);
      const vig = optBool(args, 'vignette');
      if ('error' in vig) return fail(vig.error);
      return {
        ok: true,
        resolved: {
          tool: 'trigger_decisive_move',
          opts: {
            ...(pos.x !== undefined && pos.y !== undefined
              ? { focus: { x: pos.x, y: pos.y } }
              : {}),
            ...(startAt.value !== undefined ? { startAt: startAt.value } : {}),
            ...(duration.value !== undefined ? { duration: duration.value } : {}),
            ...(zoom.value !== undefined ? { zoom: zoom.value } : {}),
            ...(vig.value !== undefined ? { vignette: vig.value } : {}),
          },
        },
        summary: 'decisive move macro',
      };
    }
    case 'trigger_why_it_worked': {
      const faction = optEnum(args, 'faction', FACTIONS);
      if ('error' in faction) return fail(faction.error);
      const vig = optBool(args, 'vignette');
      if ('error' in vig) return fail(vig.error);
      return {
        ok: true,
        resolved: {
          tool: 'trigger_why_it_worked',
          opts: {
            ...(faction.value ? { faction: faction.value } : {}),
            ...(vig.value !== undefined ? { vignette: vig.value } : {}),
          },
        },
        summary: 'why-it-worked macro',
      };
    }
    case 'trigger_signature_opening': {
      const duration = optNum(args, 'duration');
      if ('error' in duration) return fail(duration.error);
      return {
        ok: true,
        resolved: {
          tool: 'trigger_signature_opening',
          opts: duration.value !== undefined ? { duration: duration.value } : {},
        },
        summary: 'signature opening card',
      };
    }
    case 'toggle_closing_card': {
      const on = optBool(args, 'on');
      if ('error' in on) return fail(on.error);
      if (on.value === undefined) return fail('on is required');
      return {
        ok: true,
        resolved: { tool: 'toggle_closing_card', on: on.value },
        summary: `${on.value ? 'enable' : 'disable'} closing card`,
      };
    }
    case 'set_vignette': {
      const on = optBool(args, 'on');
      if ('error' in on) return fail(on.error);
      if (on.value === undefined) return fail('on is required');
      return {
        ok: true,
        resolved: { tool: 'set_vignette', on: on.value },
        summary: `${on.value ? 'enable' : 'disable'} vignette`,
      };
    }
    case 'update_brand': {
      const battleName =
        args.battleName === undefined ? undefined : String(args.battleName);
      const dateLine = args.dateLine === undefined ? undefined : String(args.dateLine);
      if (battleName === undefined && dateLine === undefined) {
        return fail('nothing to update');
      }
      return {
        ok: true,
        resolved: { tool: 'update_brand', battleName, dateLine },
        summary: 'brand metadata update',
      };
    }
    case 'set_keyframe': {
      const t = resolveTarget(scene, args.target);
      if (t.error) return fail(t.error);
      const time = optNum(args, 'time');
      if ('error' in time) return fail(time.error);
      if (time.value === undefined) return fail('time is required');
      if (time.value < 0 || time.value > scene.timeline.duration) {
        return fail(`time must be within [0, ${scene.timeline.duration}]`);
      }
      const remove = optBool(args, 'remove');
      if ('error' in remove) return fail(remove.error);
      const transform: Partial<Transform> = {};
      for (const key of ['x', 'y', 'rotation', 'scale', 'opacity'] as const) {
        const v = optNum(args, key);
        if ('error' in v) return fail(v.error);
        if (v.value !== undefined) transform[key] = v.value;
      }
      if (remove.value) {
        return {
          ok: true,
          resolved: { tool: 'set_keyframe', id: t.id!, time: time.value, transform: {}, remove: true },
          summary: `remove keyframe @ ${time.value}s`,
        };
      }
      if (Object.keys(transform).length === 0) return fail('nothing to set on the keyframe');
      if (transform.opacity !== undefined && (transform.opacity < 0 || transform.opacity > 1)) {
        return fail('opacity must be within [0, 1]');
      }
      if (transform.scale !== undefined && transform.scale <= 0) {
        return fail('scale must be greater than 0');
      }
      if (
        (transform.x !== undefined && !inBounds(scene, transform.x, 0)) ||
        (transform.y !== undefined && !inBounds(scene, transform.y, 0))
      ) {
        return fail('keyframe position is outside the map');
      }
      return {
        ok: true,
        resolved: {
          tool: 'set_keyframe',
          id: t.id!,
          time: time.value,
          transform,
        },
        summary: `keyframe @ ${time.value}s for ${scene.objects[t.id!]?.label ?? t.id}`,
      };
    }
    default:
      return fail(`unknown tool "${op.tool}"`);
  }
}

/** Validate a batch; valid ops pass through, invalid ones become errors. */
export function resolveOps(
  ops: ProposedOp[],
  scene: Scene
): { resolved: ResolvedOp[]; errors: string[] } {
  const resolved: ResolvedOp[] = [];
  const errors: string[] = [];
  for (const op of ops) {
    const r = resolveOp(op, scene);
    if (r.ok) resolved.push(r.resolved);
    else errors.push(r.error);
  }
  return { resolved, errors };
}
