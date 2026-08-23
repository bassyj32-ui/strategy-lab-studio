// Camera math — PURE module (no React, no konva, no store).
// All functions are deterministic and unit-testable without a DOM.
//
// Coordinate convention (must match the rest of the app):
//   cam.{x,y} = the WORLD point shown at the VIEWPORT CENTRE.
//   center    = { width/2, height/2 } in screen pixels.
//   rotation  = radians (MVP-1 always 0, but math supports nonzero).
//
// world -> screen:  S = center + R(rot) * (zoom * (P - cam.pos))
// screen -> world:  P = cam.pos + R(-rot) * ((S - center) / zoom)

import type { Vec2, CameraState } from '../scene/types';

// Zoom is clamped to this range so the user can never get lost or zoom to
// an invisible/infinite state.
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

/** Size of the on-screen viewport in pixels. */
export interface Viewport {
  width: number;
  height: number;
}

/** Konva <Stage> props derived from a camera + viewport. */
export interface StageProps {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

/** Read the camera rotation in radians, defaulting to 0 for MVP-1. */
function rotOf(cam: CameraState): number {
  return cam.rotation ?? 0;
}

/** Clamp a zoom value into the allowed [MIN_ZOOM, MAX_ZOOM] range. */
export function clampZoom(zoom: number): number {
  if (zoom < MIN_ZOOM) return MIN_ZOOM;
  if (zoom > MAX_ZOOM) return MAX_ZOOM;
  return zoom;
}

/** Fixed multiplicative step for the HUD Zoom In / Zoom Out buttons. */
export const ZOOM_STEP = 1.25;

/**
 * The neutral reset view: 100% zoom, no rotation. Optionally recentres on a
 * world point — callers managing a positive-quadrant world should pass the
 * WORLD CENTRE so the whole map fills the viewport (matching
 * createDefaultScene). No-arg form keeps the historical origin-centred view.
 */
export function resetCamera(center?: Vec2): CameraState {
  if (!center) return { x: 0, y: 0, zoom: 1 };
  return { x: center.x, y: center.y, zoom: 1 };
}

/**
 * Convert a WORLD point P into a SCREEN point (pixels relative to the
 * top-left of the viewport).
 */
export function worldToScreen(p: Vec2, cam: CameraState, vp: Viewport): Vec2 {
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const rot = rotOf(cam);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  // d = zoom * (P - cam.pos)
  const dx = cam.zoom * (p.x - cam.x);
  const dy = cam.zoom * (p.y - cam.y);

  // R(rot) * d
  const rx = cos * dx - sin * dy;
  const ry = sin * dx + cos * dy;

  return { x: cx + rx, y: cy + ry };
}

/**
 * Convert a SCREEN point (pixels relative to the viewport top-left) back
 * into a WORLD point. This is the exact inverse of worldToScreen.
 */
export function screenToWorld(s: Vec2, cam: CameraState, vp: Viewport): Vec2 {
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const rot = rotOf(cam);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  // d = s - center
  const dx = s.x - cx;
  const dy = s.y - cy;

  // R(-rot) * d
  const ux = cos * dx + sin * dy;
  const uy = -sin * dx + cos * dy;

  // P = cam.pos + unrot / zoom
  return {
    x: cam.x + ux / cam.zoom,
    y: cam.y + uy / cam.zoom,
  };
}

/**
 * Pan the camera by (dxScreen, dyScreen) pixels. The returned camera shows
 * the same world, just shifted so a fixed world point moves on screen by
 * exactly (dxScreen, dyScreen). Correct even when rotation != 0.
 */
export function panCamera(
  cam: CameraState,
  dxScreen: number,
  dyScreen: number,
): CameraState {
  const rot = rotOf(cam);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  // newCam.pos = cam.pos - R(-rot) * (dx, dy) / zoom
  const vx = cos * dxScreen + sin * dyScreen; // R(-rot) * (dx, dy)
  const vy = -sin * dxScreen + cos * dyScreen;

  return {
    ...cam,
    x: cam.x - vx / cam.zoom,
    y: cam.y - vy / cam.zoom,
  };
}

/**
 * Zoom by `factor` while keeping the WORLD point under `screenPoint` anchored
 * to that same screen position (cursor-centred zoom). Zoom is clamped.
 */
export function zoomAtPoint(
  cam: CameraState,
  vp: Viewport,
  factor: number,
  screenPoint: Vec2,
): CameraState {
  const rot = rotOf(cam);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const cx = vp.width / 2;
  const cy = vp.height / 2;

  // The world point currently under the cursor.
  const worldBefore = screenToWorld(screenPoint, cam, vp);
  const newZoom = clampZoom(cam.zoom * factor);

  // Solve so that screenToWorld(screenPoint, newCam, vp) == worldBefore:
  //   newCam.pos = worldBefore - R(-rot) * ((screenPoint - center) / newZoom)
  const vx = (screenPoint.x - cx) / newZoom;
  const vy = (screenPoint.y - cy) / newZoom;
  const rx = cos * vx + sin * vy; // R(-rot) * v
  const ry = -sin * vx + cos * vy;

  return {
    ...cam,
    zoom: newZoom,
    x: worldBefore.x - rx,
    y: worldBefore.y - ry,
  };
}

/**
 * Convert camera state into the props you spread onto Konva's <Stage>.
 *   Stage transform: screen = (x, y) + R(rot) * (zoom * P)
 * which equals worldToScreen(P, cam, vp).
 */
export function cameraToStageProps(cam: CameraState, vp: Viewport): StageProps {
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const rot = rotOf(cam);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  // rotated = R(rot) * (zoom * cam.pos)
  const dx = cam.zoom * cam.x;
  const dy = cam.zoom * cam.y;
  const rx = cos * dx - sin * dy;
  const ry = sin * dx + cos * dy;

  return {
    x: cx - rx,
    y: cy - ry,
    scaleX: cam.zoom,
    scaleY: cam.zoom,
    // Konva rotates in DEGREES, our camera stores radians.
    rotation: (rot * 180) / Math.PI,
  };
}
