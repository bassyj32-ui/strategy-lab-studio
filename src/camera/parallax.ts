import type { CameraState, Layer, Vec2, WorldSize } from '../scene/types';

/**
 * PARALLAX ENGINE (PRD §46 2.5D — P2). One shared pure implementation used by
 * BOTH doors (Remotion render + editor canvas) so the preview can never drift
 * from the export (architecture Law 1).
 *
 * A layer's `depthFactor` f ∈ [0,1] scales how much of the camera's motion
 * (pan/zoom/rotation, measured relative to the world centre C) the layer
 * experiences:
 *   pos' = C + (pos − C)·f
 *   zoom' = 1 + (zoom − 1)·f
 *   rot'  = rot·f
 * f = 1 is the exact identity ⇒ scenes without depth factors render
 * byte-identically to before (determinism baseline preserved). f = 0 pins the
 * layer to the map plane.
 */

export function layerDepthFactor(layer: Layer): number {
  return layer.depthFactor ?? 1;
}

export function applyParallax(
  cam: CameraState,
  factor: number,
  centre: Vec2
): CameraState {
  return {
    ...cam,
    x: centre.x + (cam.x - centre.x) * factor,
    y: centre.y + (cam.y - centre.y) * factor,
    zoom: 1 + (cam.zoom - 1) * factor,
    rotation: (cam.rotation ?? 0) * factor,
  };
}

/** Convenience: parallaxed camera for a scene layer. */
export function layerCamera(
  cam: CameraState,
  layer: Layer,
  worldSize: WorldSize
): CameraState {
  return applyParallax(cam, layerDepthFactor(layer), {
    x: worldSize.w / 2,
    y: worldSize.h / 2,
  });
}

/**
 * Extra Konva node transform that makes a layer drawn through the PARALLAXED
 * camera `d` project exactly as `cameraToStageProps(d)` would, while sitting
 * inside the Stage already transformed by `cameraToStageProps(cam)`.
 *
 * Derivation (both projections are similarities about the viewport centre):
 *   S(cam): P ↦ A_c·P + t_c   with A_c = z_c·R(rot_c), t_c = vc − A_c·cam.pos
 *   S(d):   P ↦ A_d·P + t_d
 * Required L with S(cam)∘L = S(d):
 *   L(P) = k·R(δ)·P + u,  k = z_d/z_c, δ = deg(rot_d − rot_c),
 *   u = cam.pos − k·R(δ_rad)·d.pos        (world units)
 * Returns Konva attrs {x, y, scaleX, scaleY, rotation}; identity when d == cam.
 */
export function parallaxLayerTransform(
  cam: CameraState,
  d: CameraState
): { x: number; y: number; scaleX: number; scaleY: number; rotation: number } {
  const rotC = cam.rotation ?? 0;
  const rotD = d.rotation ?? 0;
  const delta = rotD - rotC;
  const k = cam.zoom === 0 ? 1 : d.zoom / cam.zoom;
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  return {
    x: cam.x - k * (cos * d.x - sin * d.y),
    y: cam.y - k * (sin * d.x + cos * d.y),
    scaleX: k,
    scaleY: k,
    rotation: (delta * 180) / Math.PI,
  };
}
