// MOTION PRESETS — one-click "non-robotic" movement (commander-approved phase
// after the Figma-style gizmo overhaul). Pure computation, no store / React
// imports — same contract as the scene macros (macros.ts): builders return a
// deterministic payload, the store applies it in a SINGLE undoable transaction
// (see `applyMotionPreset`), and everything written stays ordinary editable
// scene data (keyframes + camera keys) afterwards.
//
// Why this kills the robotic feel (boss's words):
// - MARCH: staggered starts (no more toy soldiers stepping off together) +
//   constant-speed LINEAR segments (real columns don't ease mid-march).
// - CHARGE: accelerating easeIn + an arced path (bowed bezier), so cavalry
//   sweeps instead of kinking through a sharp corner.
// - VOLLEY: arrows fly to the anchor with tight stagger + upward arc + a
//   deterministic scatter ring (an arrow STORM, not a stack on one point).
// - SETTLE: fills `easeOut` onto final segments that have no easing yet, so
//   units arrive instead of stopping dead. Never overwrites the commander's
//   own easing choices.
// - CAMERA-PUSH: APPENDS hold-then-push keys at the playhead (unlike Decisive
//   Move, which replaces the whole track) — the slow push-in while armies
//   march that carries half the "epic" feeling.
//
// Group law: units may live in groups (LOCAL coords). All planning happens in
// WORLD space (resolveWorldTransform) and end points are mapped back into each
// object's local frame (worldPointToLocal), so grouped units march correctly.
import type {
  CameraKeyframe,
  CameraState,
  Keyframe,
  Keyframes,
  ObjId,
  Scene,
  Transform,
} from '../scene/types';
import {
  resolveWorldTransform,
  worldPointToLocal,
} from '../objects/groups';
import { MAX_ZOOM, MIN_ZOOM } from '../camera/cameraMath';

export type MotionPresetKind =
  | 'march'
  | 'charge'
  | 'volley'
  | 'settle'
  | 'camera-push';

export interface MotionPresetOpts {
  /** Objects to animate (selection). Empty = no-op for object presets. */
  ids?: ObjId[];
  /** WORLD-space destination. Defaults to the scene centre. */
  anchor?: { x: number; y: number };
  /** Timeline time the FIRST unit starts (defaults to 0). */
  startAt?: number;
  /** Seconds each unit travels (default 3). */
  duration?: number;
  /** Delay between consecutive unit starts (default 0.25; volley 0.08). */
  stagger?: number;
  /** Arc bow in world units (charge/volley). Default: 15% of travel. */
  arc?: number;
  /** End zoom for camera-push (default: keep current zoom). */
  zoom?: number;
}

export interface MotionPresetResult {
  /** FULL merged keyframe lists for every touched object (assign per id). */
  keyframes: Keyframes;
  /** FULL merged camera track (assign wholesale). Empty = untouched. */
  cameraKeys: CameraKeyframe[];
}

/** Round timeline times to the millisecond — keeps staggered times clean. */
const round3 = (t: number) => Math.round(t * 1000) / 1000;

function clampTime(scene: Scene, t: number): number {
  const dur = Math.max(0.1, scene.timeline?.duration ?? 30);
  return round3(Math.min(dur, Math.max(0, t)));
}

/** Valid animatable targets: existing objects, deterministic order. */
function targets(scene: Scene, ids?: ObjId[]): ObjId[] {
  const seen = new Set<ObjId>();
  const out: ObjId[] = [];
  for (const id of ids ?? []) {
    if (!scene.objects[id] || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.sort();
}

function sceneCentre(scene: Scene): { x: number; y: number } {
  return { x: scene.worldSize.w / 2, y: scene.worldSize.h / 2 };
}

interface PlannedMove {
  id: ObjId;
  startLocal: Transform;
  endLocal: Transform;
  /** World-space travel vector (for arc math). */
  dxw: number;
  dyw: number;
}

/**
 * Plan world-space moves that preserve the selection's formation: the
 * centroid of the units' world positions lands on the anchor, each unit keeps
 * its offset from the centroid. End points are converted back to LOCAL frames
 * so grouped units land correctly.
 */
function planMoves(
  scene: Scene,
  ids: ObjId[],
  anchor: { x: number; y: number }
): PlannedMove[] {
  const worlds = ids.map((id) => ({
    id,
    world: resolveWorldTransform(scene.objects, id),
  }));
  const cx = worlds.reduce((s, w) => s + w.world.x, 0) / worlds.length;
  const cy = worlds.reduce((s, w) => s + w.world.y, 0) / worlds.length;
  return worlds.map(({ id, world }) => {
    const obj = scene.objects[id];
    const endW = { x: anchor.x + (world.x - cx), y: anchor.y + (world.y - cy) };
    let endLocal: Transform;
    if (obj.parentId && scene.objects[obj.parentId]) {
      const parentWorld = resolveWorldTransform(scene.objects, obj.parentId);
      const p = worldPointToLocal(parentWorld, endW.x, endW.y);
      endLocal = { ...obj.transform, x: p.x, y: p.y };
    } else {
      endLocal = { ...obj.transform, x: endW.x, y: endW.y };
    }
    return {
      id,
      startLocal: { ...obj.transform },
      endLocal,
      dxw: endW.x - world.x,
      dyw: endW.y - world.y,
    };
  });
}

/**
 * Merge freshly built keys into an existing list: preset keys WIN on exact
 * time collisions (the commander just ordered this move), everything else is
 * kept, output stays time-sorted.
 */
function mergeKeys(existing: Keyframe[] | undefined, fresh: Keyframe[]): Keyframe[] {
  const times = new Set(fresh.map((k) => k.time));
  const kept = (existing ?? []).filter((k) => !times.has(k.time));
  return [...kept, ...fresh].sort((a, b) => a.time - b.time);
}

function mergeCameraKeys(
  existing: CameraKeyframe[] | undefined,
  fresh: CameraKeyframe[]
): CameraKeyframe[] {
  const times = new Set(fresh.map((k) => k.time));
  const kept = (existing ?? []).filter((k) => !times.has(k.time));
  return [...kept, ...fresh].sort((a, b) => a.time - b.time);
}

function baseView(scene: Scene): CameraState {
  const track = scene.cameraTrack;
  if (track?.length) {
    const last = track[track.length - 1].cam;
    return {
      x: last.x,
      y: last.y,
      zoom: last.zoom,
      rotation: last.rotation ?? scene.camera.rotation ?? 0,
    };
  }
  return { ...scene.camera };
}

/** Shared skeleton: staggered start/end keyframe pairs per planned move. */
function staggeredPairs(
  scene: Scene,
  moves: PlannedMove[],
  opts: {
    startAt: number;
    duration: number;
    stagger: number;
    easing: 'linear' | 'easeIn';
    curve?: (m: PlannedMove) => { cpOut?: { dx: number; dy: number }; cpIn?: { dx: number; dy: number } };
    endWorld?: (m: PlannedMove, index: number) => { x: number; y: number } | null;
  }
): Keyframes {
  const keyframes: Keyframes = {};
  moves.forEach((m, i) => {
    const t0 = clampTime(scene, opts.startAt + i * opts.stagger);
    const t1 = clampTime(scene, opts.startAt + i * opts.stagger + opts.duration);
    const start: Keyframe = { time: t0, transform: m.startLocal, easing: opts.easing };
    let endLocal = m.endLocal;
    const wb = opts.endWorld?.(m, i) ?? null;
    if (wb) {
      const obj = scene.objects[m.id];
      if (obj.parentId && scene.objects[obj.parentId]) {
        const pw = resolveWorldTransform(scene.objects, obj.parentId);
        const p = worldPointToLocal(pw, wb.x, wb.y);
        endLocal = { ...m.endLocal, x: p.x, y: p.y };
      } else {
        endLocal = { ...m.endLocal, x: wb.x, y: wb.y };
      }
    }
    const end: Keyframe = { time: t1, transform: endLocal };
    if (opts.curve) {
      const { cpOut, cpIn } = opts.curve({ ...m, endLocal });
      if (cpOut) start.cpOut = cpOut;
      if (cpIn) end.cpIn = cpIn;
    }
    // Zero-length travel (t0 === t1 after clamping): keep a single key.
    keyframes[m.id] = mergeKeys(scene.keyframes[m.id], t1 > t0 ? [start, end] : [end]);
  });
  return keyframes;
}

/**
 * MARCH: staggered constant-speed advance, formation preserved. LINEAR easing
 * is deliberate — columns march at steady pace; easing would look like the
 * whole army is on ice skates.
 */
export function buildMarch(scene: Scene, opts: MotionPresetOpts = {}): MotionPresetResult {
  const ids = targets(scene, opts.ids);
  if (!ids.length) return { keyframes: {}, cameraKeys: [] };
  const anchor = opts.anchor ?? sceneCentre(scene);
  const moves = planMoves(scene, ids, anchor);
  const keyframes = staggeredPairs(scene, moves, {
    startAt: Math.max(0, opts.startAt ?? 0),
    duration: Math.max(0.2, opts.duration ?? 3),
    stagger: Math.max(0, opts.stagger ?? 0.25),
    easing: 'linear',
  });
  return { keyframes, cameraKeys: [] };
}

/**
 * Arc helper: bow the P0→P3 segment sideways by `bow` world units along the
 * unit normal `n`. Handles are tangent-weighted (0.3 × travel) so the curve
 * leaves and arrives smoothly — no kink at either end.
 */
function arcHandles(
  dxw: number,
  dyw: number,
  nx: number,
  ny: number,
  bow: number
): { cpOut: { dx: number; dy: number }; cpIn: { dx: number; dy: number } } {
  const d = Math.hypot(dxw, dyw) || 1;
  const tx = (dxw / d) * d * 0.3;
  const ty = (dyw / d) * d * 0.3;
  return {
    cpOut: { dx: tx + nx * bow, dy: ty + ny * bow },
    cpIn: { dx: -tx + nx * bow, dy: -ty + ny * bow },
  };
}

/**
 * CHARGE: accelerating easeIn + an arced path bowed sideways (default 15% of
 * travel, deterministic left-of-travel normal) so cavalry sweeps instead of
 * cornering. Zero-travel units fall back to a straight easeIn (no NaN arcs).
 */
export function buildCharge(scene: Scene, opts: MotionPresetOpts = {}): MotionPresetResult {
  const ids = targets(scene, opts.ids);
  if (!ids.length) return { keyframes: {}, cameraKeys: [] };
  const anchor = opts.anchor ?? sceneCentre(scene);
  const moves = planMoves(scene, ids, anchor);
  const keyframes = staggeredPairs(scene, moves, {
    startAt: Math.max(0, opts.startAt ?? 0),
    duration: Math.max(0.2, opts.duration ?? 1.6),
    stagger: Math.max(0, opts.stagger ?? 0.15),
    easing: 'easeIn',
    curve: (m) => {
      const d = Math.hypot(m.dxw, m.dyw);
      if (d < 1) return {};
      const bow = opts.arc ?? d * 0.15;
      // Left-of-travel normal — deterministic for a given direction.
      return arcHandles(m.dxw, m.dyw, -m.dyw / d, m.dxw / d, bow);
    },
  });
  return { keyframes, cameraKeys: [] };
}

/**
 * Golden angle — spreads scattered points evenly with no rings or clumps.
 * Deterministic (pure math, no RNG) so volleys replay byte-identically.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * VOLLEY: selected arrows fly to the anchor with tight stagger (default
 * 0.08s), an upward arc (apex against the sky, like real arrow storms), and a
 * deterministic golden-spiral scatter (radius grows 22u per step) so the
 * arrows blanket an area instead of stacking on one point. Arrow 0 lands
 * exactly on the anchor. LINEAR timing: projectiles don't ease.
 */
export function buildVolley(scene: Scene, opts: MotionPresetOpts = {}): MotionPresetResult {
  const ids = targets(scene, opts.ids);
  if (!ids.length) return { keyframes: {}, cameraKeys: [] };
  const anchor = opts.anchor ?? sceneCentre(scene);
  const scatter = (index: number): { x: number; y: number } => {
    const r = 22 * Math.sqrt(index);
    const a = index * GOLDEN_ANGLE;
    return { x: anchor.x + Math.cos(a) * r, y: anchor.y + Math.sin(a) * r };
  };
  // Plan against the raw anchor (formation math needs a point); per-arrow
  // scatter is applied as the end-world override below.
  const moves = planMoves(scene, ids, anchor);
  const keyframes = staggeredPairs(scene, moves, {
    startAt: Math.max(0, opts.startAt ?? 0),
    duration: Math.max(0.2, opts.duration ?? 1.2),
    stagger: Math.max(0, opts.stagger ?? 0.08),
    easing: 'linear',
    curve: (m) => {
      const d = Math.hypot(m.dxw, m.dyw);
      if (d < 1) return {};
      const bow = opts.arc ?? Math.max(40, d * 0.25);
      // Straight up in world space (screen -y): the arrow-storm apex.
      return arcHandles(m.dxw, m.dyw, 0, -1, bow);
    },
    endWorld: (_m, i) => scatter(i),
  });
  return { keyframes, cameraKeys: [] };
}

/**
 * SETTLE (arrival): patch pass over EXISTING tracks — any segment whose start
 * key has NO easing yet gets `easeOut` on its final segment only... actually
 * on EVERY un-eased segment? No: minimal and predictable — the FINAL segment
 * of each object's track (the arrival the boss complained stops dead). Keys
 * the commander already eased are never touched.
 */
export function buildSettle(scene: Scene, opts: MotionPresetOpts = {}): MotionPresetResult {
  const keyframes: Keyframes = {};
  for (const id of targets(scene, opts.ids)) {
    const list = scene.keyframes[id];
    if (!list || list.length < 2) continue;
    const patched = list.map((k) => ({ ...k, transform: { ...k.transform } }));
    const lastSegStart = patched[patched.length - 2];
    if (lastSegStart.easing === undefined) lastSegStart.easing = 'easeOut';
    keyframes[id] = patched;
  }
  return { keyframes, cameraKeys: [] };
}

/**
 * CAMERA-PUSH: APPEND (never replace) hold-then-push keys at the playhead —
 * a brief hold of the current view, then an easeInOut glide to the anchor +
 * zoom. Anchor defaults to the current view centre (a pure slow zoom-in).
 * Existing track keys are preserved; preset keys win on time collisions.
 */
export function buildCameraPush(scene: Scene, opts: MotionPresetOpts = {}): MotionPresetResult {
  const base = baseView(scene);
  const startAt = Math.max(0, opts.startAt ?? 0);
  const duration = Math.max(0.2, opts.duration ?? 2.5);
  const holdAt = clampTime(scene, startAt + duration * 0.35);
  const endAt = clampTime(scene, startAt + duration);
  const anchor = opts.anchor ?? { x: base.x, y: base.y };
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, opts.zoom ?? Math.min(MAX_ZOOM, base.zoom * 1.6))
  );
  const view = { x: base.x, y: base.y, zoom: base.zoom, rotation: base.rotation ?? 0 };
  const fresh: CameraKeyframe[] = [
    { time: clampTime(scene, startAt), cam: { ...view }, easing: 'easeInOut' },
    { time: holdAt, cam: { ...view }, easing: 'easeInOut' },
    {
      time: endAt,
      cam: { x: anchor.x, y: anchor.y, zoom, rotation: base.rotation ?? 0 },
      easing: 'easeInOut',
    },
  ];
  const cameraKeys = mergeCameraKeys(scene.cameraTrack, fresh);
  return { keyframes: {}, cameraKeys };
}

const BUILDERS: Record<MotionPresetKind, (scene: Scene, opts: MotionPresetOpts) => MotionPresetResult> = {
  march: buildMarch,
  charge: buildCharge,
  volley: buildVolley,
  settle: buildSettle,
  'camera-push': buildCameraPush,
};

/** Dispatch a preset kind to its pure builder (used by the store + AI ops). */
export function buildMotionPreset(
  scene: Scene,
  kind: MotionPresetKind,
  opts: MotionPresetOpts = {}
): MotionPresetResult {
  return BUILDERS[kind](scene, opts);
}
