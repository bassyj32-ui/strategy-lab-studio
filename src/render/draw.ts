import type { Scene, Transform } from '../scene/types';
import type { AssetImageMap, ScreenTransform } from './types';
// Single consumption path (architecture §6.2): the SAME pure selector the
// timeline uses. Never duplicate interpolation math here.
import { getObjectWorldTransformAtTime } from '../timeline/selectors';
import { getCameraAtTime } from '../timeline/cameraTrack';
import { applyCamera } from './camera';
import {
  FACTION_COLORS,
  CONFIDENCE_META,
  annotationRingRadius,
  labelOffsetY,
  badgeOffsetY,
} from '../objects/annotations';
import { sortForRender } from '../objects/depth';

const BACKGROUND = '#0b0e14';

/**
 * Drop-shadow constants (owner-approved P1 pull-forward). All values are FIXED
 * constants — no randomness, no time-of-day, no per-object variation beyond
 * camera scale — so a shadowed frame is byte-identical across renders.
 * Offsets/blur multiply by screen scale so the shadow stays world-consistent
 * at any zoom (same rule as arrow lineWidth).
 */
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.45)';
const SHADOW_BLUR = 12;
const SHADOW_OFFSET_X = 4;
const SHADOW_OFFSET_Y = 6;

/** Options for `drawScene` (all optional; defaults reproduce MVP-1 behavior). */
export interface DrawSceneOptions {
  /**
   * ALPHA EXPORT MODE: paint objects only — skip the opaque background fill
   * AND the map image — so the output is a transparent overlay for layering
   * in external tools (CapCut/DaVinci). The failure banner is suppressed too,
   * because the map is intentionally not part of an overlay's output.
   */
  transparentBackground?: boolean;
}

/** Placeholder fill color by object type when its asset image is unavailable. */
const PLACEHOLDER_COLORS: Record<string, string> = {
  unit: '#4ade80',
  shape: '#60a5fa',
  marker: '#f59e0b',
};

const PLACEHOLDER_SIZE = 40;

/**
 * Paint one frame of the scene onto a 2D canvas context, deterministically.
 *
 * Stable draw order (for byte-stable output):
 *   1. clear + fill background (skipped in alpha mode)
 *   2. draw the map image (centered on world center; objects are NEVER baked in;
 *      skipped in alpha mode)
 *   3. for each layer (asc by `order`, skip invisible), for each object
 *      (asc by ObjId): interpolate -> project -> draw image or placeholder,
 *      with a fixed soft offset shadow when the object's asset metadata says
 *      `defaultShadow: true` (owner-approved P1 pull-forward).
 *
 * READ-ONLY: this function never mutates `scene`, its keyframes, assets, or the
 * camera. The same scene + frame always paints identically.
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  frame: number,
  fps: number,
  videoSize: { w: number; h: number },
  images: AssetImageMap,
  options: DrawSceneOptions = {}
): void {
  const { worldSize } = scene;
  // Animated camera: evaluate the per-scene track at THIS frame's time.
  // With no track this is a copy of the base camera, so zero-keyframe scenes
  // stay byte-identical to pre-track renders. Single shared engine — never
  // duplicate interpolation math here (Law 1).
  const camera = getCameraAtTime(scene, frame / fps);
  const { transparentBackground = false } = options;

  // 1. clear + background (skipped in alpha mode: output must stay transparent)
  ctx.clearRect(0, 0, videoSize.w, videoSize.h);
  if (!transparentBackground) {
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, videoSize.w, videoSize.h);
  }

  // 1b. LOUD deterministic failure banner: a scene that DECLARES a map but
  // whose map image is missing must never look like intentional art.
  // (Standard mode only — an alpha overlay intentionally excludes the map,
  // so a missing map is not a defect of that output.)
  if (!transparentBackground && scene.mapAssetId && !images[scene.mapAssetId]) {
    const asset = scene.assets[scene.mapAssetId];
    ctx.save();
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(0, 0, videoSize.w, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `MAP ASSET FAILED TO LOAD: ${asset?.name ?? scene.mapAssetId}`,
      24,
      32
    );
    ctx.restore();
  }

  // 2. map image (centered at world center, never baked with objects).
  // Skipped entirely in alpha mode: the overlay is objects-only.
  if (!transparentBackground && scene.mapAssetId) {
    const mapImg = images[scene.mapAssetId];
    if (mapImg) {
      const mapTransform: Transform = {
        x: worldSize.w / 2,
        y: worldSize.h / 2,
        rotation: 0,
        scale: 1,
        opacity: 1,
      };
      const screen = applyCamera(mapTransform, camera, worldSize, videoSize);
      const dw = (mapImg.width || worldSize.w) * screen.scale;
      const dh = (mapImg.height || worldSize.h) * screen.scale;
      ctx.save();
      ctx.globalAlpha = screen.opacity;
      ctx.translate(screen.x, screen.y);
      ctx.rotate((screen.rotation * Math.PI) / 180);
      ctx.drawImage(mapImg, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
  }

  // 3. layers -> objects
  const layers = [...scene.layers].sort((a, b) => a.order - b.order);
  const t = frame / fps;
  for (const layer of layers) {
    if (!layer.visible) continue;
    const layerObjs = sortForRender(
      Object.values(scene.objects).filter((o) => o.layerId === layer.id)
    );
    for (const obj of layerObjs) {
      const id = obj.id;
      // Asset resolved ONCE per object: image source + shadow decision both
      // come from the SAME asset record (non-destructive; PRD §43).
      const asset = obj.assetId ? scene.assets[obj.assetId] : undefined;
      const wantShadow = asset?.metadata?.defaultShadow === true;
      // Single consumption path (architecture.md §6.2): the Remotion render
      // reads animation through the SAME pure selector as the editor preview.
      const world = getObjectWorldTransformAtTime(scene, id, t);
      const screen: ScreenTransform = applyCamera(
        world,
        camera,
        worldSize,
        videoSize
      );

      ctx.save();
      ctx.globalAlpha = screen.opacity;
      if (wantShadow) {
        // Fixed soft offset shadow (canvas 2D). Scale-relative so world-space
        // shadow geometry is identical at any camera zoom. Fully deterministic:
        // constant color/blur/offsets, applied in stable draw order.
        ctx.shadowColor = SHADOW_COLOR;
        ctx.shadowBlur = SHADOW_BLUR * screen.scale;
        ctx.shadowOffsetX = SHADOW_OFFSET_X * screen.scale;
        ctx.shadowOffsetY = SHADOW_OFFSET_Y * screen.scale;
      }
      ctx.translate(screen.x, screen.y);
      ctx.rotate((screen.rotation * Math.PI) / 180);

      const img = obj.assetId ? images[obj.assetId] : null;
      // Annotation geometry (P2 §36/§37) is computed in LOCAL units then
      // scaled to screen so both render doors agree.
      const ringR =
        annotationRingRadius(obj, asset ?? undefined) * screen.scale;
      if (img) {
        const w = (asset?.width ?? img.width) * screen.scale;
        const h = (asset?.height ?? img.height) * screen.scale;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else if (obj.type === 'arrow') {
        // MVP-2 arrow (owner-approved). Tail at local origin, tip along +X —
        // same local geometry as the Konva door. Sizes scale with the camera
        // so world-space thickness stays consistent at any zoom.
        const len = (obj.length ?? 120) * screen.scale;
        const s = screen.scale;
        ctx.strokeStyle = obj.color ?? '#f5a83c';
        ctx.fillStyle = obj.color ?? '#f5a83c';
        ctx.lineWidth = 6 * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(len, 0);
        ctx.lineTo(len - 18 * s, -11 * s);
        ctx.lineTo(len - 18 * s, 11 * s);
        ctx.closePath();
        ctx.fill();
      } else {
        const size = PLACEHOLDER_SIZE * screen.scale;
        ctx.fillStyle = PLACEHOLDER_COLORS[obj.type] ?? '#888888';
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }

      // Faction ring (P2 §36): a circle is rotation-invariant, so it is safe
      // to stroke inside the rotated frame. Restrained: 3px world-scaled
      // stroke, no fill.
      if (obj.faction) {
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = FACTION_COLORS[obj.faction];
        ctx.lineWidth = 3 * screen.scale;
        ctx.stroke();
      }
      ctx.restore();

      // Name label + confidence badge are painted in SCREEN space AFTER
      // restore so text stays horizontal no matter how the object (or its
      // group) is rotated. globalAlpha is re-applied for opacity parity.
      if ((obj.label || obj.confidence) && screen.opacity > 0) {
        ctx.globalAlpha = screen.opacity;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (obj.label) {
          const fs = Math.max(12, 16 * screen.scale);
          ctx.font = `600 ${fs}px system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(11,14,20,0.75)';
          const metrics = ctx.measureText(obj.label);
          const padX = 8 * screen.scale;
          const chipH = fs + 8 * screen.scale;
          const chipY =
            screen.y + labelOffsetY(ringR / screen.scale) * screen.scale;
          ctx.fillRect(
            screen.x - metrics.width / 2 - padX,
            chipY - chipH / 2,
            metrics.width + padX * 2,
            chipH
          );
          ctx.fillStyle = '#e5e7eb';
          ctx.fillText(obj.label, screen.x, chipY);
        }
        if (obj.confidence) {
          const meta = CONFIDENCE_META[obj.confidence];
          const fs = Math.max(9, 11 * screen.scale);
          ctx.font = `700 ${fs}px system-ui, sans-serif`;
          ctx.fillStyle = meta.color;
          ctx.fillText(
            meta.text,
            screen.x,
            screen.y + badgeOffsetY(ringR / screen.scale) * screen.scale
          );
        }
      }
    }
  }

  // 5. Cinematic vignette (PRD §38, scene-level flag). Deterministic radial
  // gradient painted AFTER objects; never baked into assets. Skipped in alpha
  // mode (objects-only overlay output).
  if (!transparentBackground && scene.vignette) {
    const { w, h } = videoSize;
    const cx = w / 2;
    const cy = h / 2;
    const grad = ctx.createRadialGradient(
      cx,
      cy,
      Math.min(w, h) * 0.45,
      cx,
      cy,
      Math.max(w, h) * 0.72
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = grad as unknown as string;
    ctx.fillRect(0, 0, w, h);
  }
}
