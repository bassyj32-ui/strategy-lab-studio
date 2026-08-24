import type { CameraKeyframe, CameraState, Scene } from '../scene/types';

/**
 * CANONICAL camera-track evaluation — the ONE shared implementation consumed
 * by the editor canvas (via CanvasStage), the Remotion render path (draw.ts),
 * and any future consumer. There must never be a second camera interpolator.
 *
 * Semantics mirror src/render/interpolate.ts exactly:
 * - No track / empty track -> a copy of `scene.camera` (the live base view),
 *   so zero-keyframe scenes behave byte-identically to pre-track scenes.
 * - Before first / after last keyframe -> HOLD (clamp to nearest keyframe).
 * - Between two keyframes -> LINEAR lerp of x/y/zoom and, when the keyframes
 *   carry it, `rotation` (RADIANS — canonical unit, scene/types.ts).
 * - `rotation` absent on a keyframe falls back to the base `scene.camera`.
 * - Pure + deterministic: same inputs -> same outputs, no clocks, no RNG.
 */
export function getCameraAtTime(scene: Scene, time: number): CameraState {
  const base = scene.camera;
  const track: CameraKeyframe[] | undefined = scene.cameraTrack;

  if (!track || track.length === 0) {
    return { ...base };
  }

  // Safe even if the incoming array is unsorted.
  const sorted = [...track].sort((a, b) => a.time - b.time);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (time <= first.time) return { ...base, ...first.cam };
  if (time >= last.time) return { ...base, ...last.cam };

  let a = first;
  let b = last;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time < sorted[i + 1].time) {
      a = sorted[i];
      b = sorted[i + 1];
      break;
    }
  }

  if (a.time === b.time) return { ...base, ...a.cam };

  const t = (time - a.time) / (b.time - a.time);
  const lerp = (p: number, q: number): number => p + (q - p) * t;
  // Rotation is animated only when the keyframes carry it; otherwise the
  // pre-rotation behaviour (base rotation throughout) is preserved exactly.
  const rot =
    a.cam.rotation !== undefined && b.cam.rotation !== undefined
      ? lerp(a.cam.rotation, b.cam.rotation)
      : base.rotation;
  return {
    x: lerp(a.cam.x, b.cam.x),
    y: lerp(a.cam.y, b.cam.y),
    zoom: lerp(a.cam.zoom, b.cam.zoom),
    rotation: rot,
  };
}

/** True when the scene carries at least one camera keyframe. */
export function hasCameraTrack(scene: Scene): boolean {
  return !!scene.cameraTrack && scene.cameraTrack.length > 0;
}
