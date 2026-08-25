import type { CameraKeyframe, Scene } from '../scene/types';
import { MIN_ZOOM, MAX_ZOOM } from './cameraMath';

/**
 * Named camera presets (PRD §27). A preset is PURE: it computes camera-track
 * keyframes from the scene itself (world size + timeline duration), so it
 * stays deterministic and trivially testable. Applying one REPLACES the
 * scene's `cameraTrack` (one undo step); the user then edits those keyframes
 * with the normal track tools ("presets must remain editable", §27).
 */

export type CameraPresetKind =
  | 'overview'
  | 'tactical'
  | 'flank-follow'
  | 'commander-focus'
  | 'decisive';

export const CAMERA_PRESETS: ReadonlyArray<{ kind: CameraPresetKind; label: string }> = [
  { kind: 'overview', label: 'Battlefield Overview' },
  { kind: 'tactical', label: 'Tactical Zoom' },
  { kind: 'flank-follow', label: 'Flank Follow' },
  { kind: 'commander-focus', label: 'Commander Focus' },
  { kind: 'decisive', label: 'Decisive Moment' },
];

/**
 * The framing target is the EXPORT video frame (EXPORT_RESOLUTION 1920×1080).
 * Duplicated here instead of imported from render/defaultProps so this module
 * stays free of render-pipeline dependencies (no import cycles).
 */
const FRAME = { w: 1920, h: 1080 } as const;

const clampZoomRange = (z: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export interface CameraPresetFocus {
  x: number;
  y: number;
}

/**
 * Compute the keyframes for `kind` against `scene`.
 * `focus` (optional) is the world point Commander Focus should centre on —
 * callers pass the selected object's position; without it the preset falls
 * back to the world centre.
 */
export function buildCameraPreset(
  kind: CameraPresetKind,
  scene: Scene,
  focus?: CameraPresetFocus
): CameraKeyframe[] {
  const w = scene.worldSize.w;
  const h = scene.worldSize.h;
  const cx = w / 2;
  const cy = h / 2;
  // Animated presets span the full timeline; guard against degenerate values.
  const dur = Math.max(scene.timeline.duration, 1);

  switch (kind) {
    case 'overview': {
      // Zoom-to-fit: the whole battlefield visible inside the video frame.
      const zoom = clampZoomRange(Math.min(FRAME.w / w, FRAME.h / h));
      return [{ time: 0, cam: { x: cx, y: cy, zoom } }];
    }
    case 'tactical':
      return [{ time: 0, cam: { x: cx, y: cy, zoom: 1.8 } }];
    case 'flank-follow': {
      // Steady lateral pan across the line of battle, left → right.
      return [
        { time: 0, cam: { x: w * 0.3, y: cy, zoom: 1.5 }, easing: 'easeInOut' },
        { time: dur, cam: { x: w * 0.7, y: cy, zoom: 1.5 }, easing: 'easeInOut' },
      ];
    }
    case 'commander-focus': {
      const px = focus ? focus.x : cx;
      const py = focus ? focus.y : cy;
      return [{ time: 0, cam: { x: px, y: py, zoom: 2 } }];
    }
    case 'decisive':
      // Slow dramatic push-in toward the centre of the action.
      return [
        { time: 0, cam: { x: cx, y: cy, zoom: 1 }, easing: 'easeInOut' },
        { time: dur, cam: { x: cx, y: cy, zoom: 1.6 }, easing: 'easeInOut' },
      ];
  }
}
