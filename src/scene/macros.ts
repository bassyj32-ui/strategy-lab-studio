// P2 "DECISIVE MOVE" native macro (PRD §38) — pure computation, no store /
// React imports. The macro composes EXISTING primitives (camera-track keys,
// a highlight marker, a tactical arrow, opacity-keyframe pulse, optional
// vignette flag) into one deterministic payload; the store applies it in a
// single undoable transaction. Everything it creates stays independently
// editable afterwards (PRD §38 "Everything remains editable").
import type {
  CameraKeyframe,
  Faction,
  Keyframes,
  Keyframe,
  ObjId,
  Scene,
  SceneObject,
} from './types';
import { createSceneObject } from '../objects/factory';
import { DEFAULT_LAYER_ID } from './factory';
import { createId } from './id';
import { MAX_ZOOM, MIN_ZOOM } from '../camera/cameraMath';

export interface DecisiveMoveOptions {
  /** World point the move focuses on (defaults to the world centre). */
  focus?: { x: number; y: number };
  /** Timeline time the move starts (defaults to 0). */
  startAt?: number;
  /** Seconds from push-in start to full zoom (default 2). */
  duration?: number;
  /** Target zoom at the focal point (default 2.2, clamped to editor range). */
  zoom?: number;
  /** Pulse the highlight marker's opacity while zoomed (default true). */
  pulse?: boolean;
  /**
    * Dramatic timing: hold the establishing view briefly before pushing in,
    * approximating ease-in with LINEAR keys (default true).
    */
  dramaticTiming?: boolean;
  /** Enable the scene's cinematic edge-darkening flag (default false). */
  vignette?: boolean;
  /** Tail position of the tactical arrow (defaults to up-left of focus). */
  arrowFrom?: { x: number; y: number };
}

export interface DecisiveMoveResult {
  /** REPLACES the scene's camera track (editable afterwards like any keys). */
  cameraKeys: CameraKeyframe[];
  objects: SceneObject[];
  keyframes: Keyframes;
  vignette: boolean;
  /** Id of the created highlight marker (for post-apply selection). */
  highlightId: ObjId;
}

const PULSES = 3;

/**
 * Build the full decisive-move payload. Deterministic: same inputs produce
 * deep-equal output (ids included are fresh — tests compare shape, not ids).
 */
export function buildDecisiveMove(
  scene: Scene,
  opts: DecisiveMoveOptions = {}
): DecisiveMoveResult {
  const focus =
    opts.focus ??
    { x: scene.worldSize.w / 2, y: scene.worldSize.h / 2 };
  const startAt = Math.max(0, opts.startAt ?? 0);
  const duration = Math.max(0.2, opts.duration ?? 2);
  const endAt = startAt + duration;
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, opts.zoom ?? 2.2)
  );
  const dramatic = opts.dramaticTiming ?? true;

  // ---- camera: establish (hold under dramatic timing) → push in ----
  const base = scene.cameraTrack?.length
    ? scene.cameraTrack[scene.cameraTrack.length - 1].cam
    : scene.camera;
  const cameraKeys: CameraKeyframe[] = [
    { time: startAt, cam: { x: base.x, y: base.y, zoom: base.zoom } },
  ];
  if (dramatic) {
    cameraKeys.push({
      time: startAt + duration * 0.35,
      cam: { x: base.x, y: base.y, zoom: base.zoom },
    });
  }
  cameraKeys.push({ time: endAt, cam: { x: focus.x, y: focus.y, zoom } });

  // ---- highlight marker at the focal point ----
  const highlightId = createId('marker');
  const highlight = createSceneObject('marker', {
    id: highlightId,
    layerId: DEFAULT_LAYER_ID,
    x: focus.x,
    y: focus.y,
  });
  highlight.transform.scale = 2;
  const objects: SceneObject[] = [highlight];

  // ---- optional pulse: opacity oscillation across the move window ----
  const keyframes: Keyframes = {};
  if (opts.pulse ?? true) {
    const frames: Keyframe[] = [];
    const steps = PULSES * 2;
    for (let i = 0; i <= steps; i++) {
      frames.push({
        time: startAt + (duration * i) / steps,
        transform: {
          ...highlight.transform,
          opacity: i % 2 === 0 ? 1 : 0.35,
        },
      });
    }
    keyframes[highlightId] = frames;
  }

  // ---- tactical arrow pointing at the focus ----
  const from =
    opts.arrowFrom ?? { x: focus.x - 420, y: focus.y - 320 };
  const dx = focus.x - from.x;
  const dy = focus.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length > 12) {
    objects.push(
      createSceneObject('arrow', {
        id: createId('arrow'),
        layerId: DEFAULT_LAYER_ID,
        x: from.x,
        y: from.y,
        rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
        length,
      })
    );
  }

  return { cameraKeys, objects, keyframes, vignette: opts.vignette ?? false, highlightId };
}

export interface WhyItWorkedOptions {
  /** Faction whose units gently pulse during the reveal (default: none). */
  faction?: Faction;
  /** Timeline time the reveal starts (defaults to 0). */
  startAt?: number;
  /** Seconds from the current framing to the overview (default 3). */
  duration?: number;
  /** Target overview zoom (default 1.2, clamped to editor range). */
  zoom?: number;
  /** Gently pulse the winning faction's units (default true). */
  pulse?: boolean;
  /** Enable the scene's cinematic edge-darkening flag (default false). */
  vignette?: boolean;
}

export interface WhyItWorkedResult {
  /** REPLACES the scene's camera track (editable afterwards like any keys). */
  cameraKeys: CameraKeyframe[];
  /** Per-object opacity pulses for the highlighted faction's units. */
  keyframes: Keyframes;
  vignette: boolean;
  /** Ids that received pulse keyframes (for tests / post-apply selection). */
  pulsedIds: ObjId[];
}

const WIW_PULSES = 2;
/** Gentle pulse floor — a calm "look here", not an alarm. */
const WIW_OPACITY_FLOOR = 0.55;

/**
 * P2 "WHY IT WORKED" visual preset (PRD §39): ONE deterministic payload that
 * pulls the camera back from wherever it is to a calm battlefield overview
 * and optionally breathes the winning faction's units while it does. Pure
 * computation over EXISTING primitives; narration/text/music stay in
 * CapCut/DaVinci — the Studio only prepares the picture.
 */
export function buildWhyItWorked(
  scene: Scene,
  opts: WhyItWorkedOptions = {}
): WhyItWorkedResult {
  const startAt = Math.max(0, opts.startAt ?? 0);
  const duration = Math.max(0.5, opts.duration ?? 3);
  const endAt = startAt + duration;
  const centre = { x: scene.worldSize.w / 2, y: scene.worldSize.h / 2 };
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, opts.zoom ?? 1.2)
  );

  // ---- camera: hold the current view briefly, then settle to overview ----
  const base = scene.cameraTrack?.length
    ? scene.cameraTrack[scene.cameraTrack.length - 1].cam
    : scene.camera;
  const cameraKeys: CameraKeyframe[] = [
    { time: startAt, cam: { x: base.x, y: base.y, zoom: base.zoom } },
    {
      time: startAt + duration * 0.25,
      cam: { x: base.x, y: base.y, zoom: base.zoom },
    },
    { time: endAt, cam: { x: centre.x, y: centre.y, zoom } },
  ];

  // ---- gentle pulse of the winning faction's units ----
  const keyframes: Keyframes = {};
  const pulsedIds: ObjId[] = [];
  if ((opts.pulse ?? true) && opts.faction) {
    const steps = WIW_PULSES * 2;
    for (const obj of Object.values(scene.objects)) {
      if (obj.faction !== opts.faction) continue;
      const frames: Keyframe[] = [];
      for (let i = 0; i <= steps; i++) {
        frames.push({
          time: startAt + (duration * i) / steps,
          transform: {
            ...obj.transform,
            opacity:
              i % 2 === 0 ? obj.transform.opacity : WIW_OPACITY_FLOOR,
          },
        });
      }
      keyframes[obj.id] = frames;
      pulsedIds.push(obj.id);
    }
  }

  return { cameraKeys, keyframes, vignette: opts.vignette ?? false, pulsedIds };
}
