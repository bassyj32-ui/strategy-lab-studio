import type { Transform, CameraState, WorldSize } from '../scene/types';
import type { ScreenTransform } from './types';

/**
 * Project a world-space `Transform` to screen (pixel) space given the camera
 * and canvas dimensions.
 *
 * Conventions (confirmed decisions):
 * - Object `x,y` is its CENTER in world coordinates.
 * - Camera `x,y` is the CENTER of the view in world coordinates.
 * - Camera `rotation` rotates the whole view, so a world offset is rotated by
 *   `-camera.rotation` and the object's screen rotation is
 *   `world.rotation + camera.rotation`.
 * - `zoom` scales the projected offset (and the object's drawn size).
 *
 * Pure + deterministic: no mutation, no side effects.
 */
export function applyCamera(
  world: Transform,
  camera: CameraState,
  // `worldSize` is part of the render contract (camera projection math is
  // independent of world dimensions), so it is intentionally unused here.
  _worldSize: WorldSize,
  videoSize: { w: number; h: number }
): ScreenTransform {
  const camRot = camera.rotation ?? 0;
  const zoom = camera.zoom;

  // Offset from camera center to object, in world units.
  const ox = world.x - camera.x;
  const oy = world.y - camera.y;

  // Rotate the offset by -camera.rotation (view rotation).
  const rad = (-camRot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = ox * cos - oy * sin;
  const ry = ox * sin + oy * cos;

  const vcx = videoSize.w / 2;
  const vcy = videoSize.h / 2;

  return {
    x: vcx + rx * zoom,
    y: vcy + ry * zoom,
    rotation: world.rotation + camRot,
    scale: world.scale * zoom,
    opacity: world.opacity,
  };
}
