import type { Scene, TitleCardConfig, Transform } from '../scene/types';
import type { AssetImageMap, ScreenTransform } from './types';
import type { CardWindow } from '../scene/branding';
// Single consumption path (architecture §6.2): the SAME pure selector the
// timeline uses. Never duplicate interpolation math here.
import { getObjectWorldTransformAtTime } from '../timeline/selectors';
import { getCameraAtTime } from '../timeline/cameraTrack';
import { applyCamera } from './camera';
import { layerCamera } from '../camera/parallax';
import {
  CONFIDENCE_META,
  annotationRingRadius,
  labelOffsetY,
  badgeOffsetY,
} from '../objects/annotations';
import {
  effectRings,
  effectColor,
  effectBurst,
  instanceActive,
  INSTANCE_BASE_RADIUS,
} from '../objects/effects';
import { sortForRender } from '../objects/depth';
import { arrowStyleSpec } from '../objects/arrowStyles';
import { directChildren, groupBoundingBox } from '../objects/groups';
import {
  TYPOGRAPHY,
  BRAND_ACCENT,
  DEFAULT_CARD_KICKER,
  DEFAULT_CLOSING_TITLE,
  resolveFactionColors,
  openingCardWindow,
  closingCardWindow,
  cardAlpha,
} from '../scene/branding';
import { UNIT_PLACEHOLDER } from '../scene/placeholder';
import {
  SHADOW_BLUR,
  SHADOW_COLOR,
  SHADOW_OFFSET_X,
  SHADOW_OFFSET_Y,
} from './shadows';

const BACKGROUND = '#0b0e14';

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
 *   4. cinematic vignette (§38) when flagged
 *   5. §95/§96 title-card overlays (opening / ending), alpha-mode excluded
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
  // PARALLAX (§46): each layer is viewed through its own depth-scaled camera
  // (shared pure engine in camera/parallax.ts). factor 1 = identity, so
  // scenes without depth factors take the exact pre-parallax code path.
  for (const layer of layers) {
    if (!layer.visible) continue;
    const layerCam = layerCamera(camera, layer, worldSize);
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
        layerCam,
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
        // MVP-2 arrow (owner-approved) + §32 signature styles. Tail at local
        // origin, tip along +X — same local geometry as the Konva door, with
        // thickness/head/opacity/dash fixed by the SHARED spec table so both
        // doors agree pixel-for-pixel. Sizes scale with the camera so
        // world-space geometry stays consistent at any zoom.
        const len = (obj.length ?? 120) * screen.scale;
        const s = screen.scale;
        const spec = arrowStyleSpec(obj.arrowStyle);
        ctx.save();
        ctx.globalAlpha = screen.opacity * spec.opacity;
        if (spec.dash) {
          ctx.setLineDash(spec.dash.map((d) => d * s));
        }
        ctx.strokeStyle = obj.color ?? '#f5a83c';
        ctx.fillStyle = obj.color ?? '#f5a83c';
        ctx.lineWidth = spec.shaftWidth * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, 0);
        ctx.stroke();
        ctx.setLineDash([]); // head is always solid, even on dashed styles
        ctx.beginPath();
        ctx.moveTo(len, 0);
        ctx.lineTo(len - spec.headLength * s, -spec.headHalfWidth * s);
        ctx.lineTo(len - spec.headLength * s, spec.headHalfWidth * s);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (obj.type === 'unit') {
        // Asset-less UNIT placeholder — MUST match objects/ObjectNode.tsx
        // (REV-PASS FIX #1 parity). Paints the same gray "U" box the editor
        // shows, so a no-asset unit no longer drifts to a green square in the
        // export. Other placeholder types below are intentionally untouched.
        if (obj.discColor) {
          // DISC-ONLY mode (viral battle-map style): solid filled circle.
          const r = 36 * screen.scale;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = obj.discColor;
          ctx.fill();
        } else {
          const size = UNIT_PLACEHOLDER.size * screen.scale;
          const r = UNIT_PLACEHOLDER.cornerRadius * screen.scale;
          ctx.fillStyle = UNIT_PLACEHOLDER.color;
          ctx.beginPath();
          ctx.roundRect(-size / 2, -size / 2, size, size, r);
          ctx.fill();
          ctx.fillStyle = UNIT_PLACEHOLDER.labelColor;
          ctx.font = `${UNIT_PLACEHOLDER.labelFontSize * screen.scale}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(UNIT_PLACEHOLDER.label, 0, 0);
        }
      } else {
        // shape / marker / group / arrow-less: unchanged 40px placeholder.
        const size = PLACEHOLDER_SIZE * screen.scale;
        ctx.fillStyle = PLACEHOLDER_COLORS[obj.type] ?? '#888888';
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }

      // §50 effect halo (P2): concentric deterministic rings painted inside
      // the rotated frame — circles are rotation-invariant, same as the
      // faction ring. Alpha stacks on the object's own opacity.
      if (obj.effect) {
        for (const ring of effectRings(obj.effect, t)) {
          ctx.beginPath();
          ctx.arc(0, 0, ringR * ring.radiusFactor, 0, Math.PI * 2);
          ctx.globalAlpha = screen.opacity * ring.alpha;
          ctx.fillStyle = effectColor(obj.effect);
          ctx.fill();
        }
        ctx.globalAlpha = screen.opacity;
      }

      // Faction ring (P2 §36): a circle is rotation-invariant, so it is safe
      // to stroke inside the rotated frame. Restrained: 3px world-scaled
      // stroke, no fill.
      if (obj.faction) {
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        // §93: per-scene brand overrides merged over the §31 defaults.
        ctx.strokeStyle = resolveFactionColors(scene.brand)[obj.faction];
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

  // 4a. Cluster glow (viral battle-map style): soft glow around each group's
  // AABB. Painted AFTER objects so it reads as a background aura.
  for (const obj of Object.values(scene.objects)) {
    if (!obj.clusterGlow || (obj.type !== 'group' && directChildren(scene.objects, obj.id).length === 0)) continue;
    const bb = groupBoundingBox(scene.objects, obj.id, (id) => {
      const wt = getObjectWorldTransformAtTime(scene, id, t);
      return applyCamera(wt, camera, scene.worldSize, videoSize);
    });
    if (!bb) continue;
    const pad = obj.clusterGlow.radius * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.shadowColor = obj.clusterGlow.color;
    ctx.shadowBlur = obj.clusterGlow.radius;
    ctx.strokeStyle = obj.clusterGlow.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(bb.minX - pad, bb.minY - pad, bb.maxX - bb.minX + pad * 2, bb.maxY - bb.minY + pad * 2);
    ctx.restore();
  }

  // 4b. Battle FX (collision-triggered effect instances). Deterministic burst
  // rings in WORLD space under the BASE camera, painted after objects so they
  // read as foreground flashes; each instance only shows inside its window.
  if (scene.effects) {
    for (const inst of Object.values(scene.effects)) {
      if (!instanceActive(t, inst.startTime, inst.duration)) continue;
      const screen = applyCamera(
        { x: inst.x, y: inst.y, rotation: 0, scale: 1, opacity: 1 },
        camera,
        scene.worldSize,
        videoSize
      );
      const baseR = INSTANCE_BASE_RADIUS * screen.scale;
      for (const ring of effectBurst(inst.kind, t - inst.startTime, inst.duration)) {
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, baseR * ring.radiusFactor, 0, Math.PI * 2);
        ctx.globalAlpha = screen.opacity * ring.alpha;
        ctx.fillStyle = effectColor(inst.kind);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
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

  // 6. §95/§96 TITLE CARDS (signature opening / ending). One deterministic
  // overlay pass per enabled card: full-frame dark veil + kicker / title /
  // subtitle in brand typography. Alpha comes from the shared fade envelope
  // (pure function of time), so a given frame always paints identically.
  // Skipped in alpha mode like the vignette (objects-only output).
  if (!transparentBackground) {
    const { w, h } = videoSize;
    const drawCard = (
      cfg: TitleCardConfig | undefined,
      win: CardWindow,
      fallbackTitle: string
    ): void => {
      if (!cfg) return;
      const alpha = cardAlpha(t, win);
      if (alpha <= 0) return;
      const base = Math.min(w, h);
      ctx.save();
      // Veil: near-opaque dark wash so the card always reads over the map.
      ctx.globalAlpha = alpha * 0.92;
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const kicker = cfg.kicker ?? scene.brand?.battleName ?? DEFAULT_CARD_KICKER;
      const title =
        cfg.title ?? scene.brand?.battleName ?? fallbackTitle;
      const subtitle = cfg.subtitle ?? scene.brand?.dateLine ?? '';

      const kickY = h * 0.42;
      const titleY = h * 0.5;
      const ruleW = base * 0.06;

      // Kicker (small caps feel via uppercase + letterspacing approximation).
      const kfs = Math.max(12, base * 0.018);
      ctx.font = `700 ${kfs}px ${TYPOGRAPHY.primary}`;
      ctx.fillStyle = BRAND_ACCENT;
      ctx.fillText(kicker.toUpperCase(), w / 2, kickY);

      // Amber accent rule between kicker and title.
      ctx.fillRect(w / 2 - ruleW / 2, kickY + kfs * 1.2, ruleW, Math.max(1, base * 0.002));

      // Main display title.
      const tfs = Math.max(24, base * 0.07);
      ctx.font = `700 ${tfs}px ${TYPOGRAPHY.display}`;
      ctx.fillStyle = '#f3f4f6';
      ctx.fillText(title, w / 2, titleY);

      // Optional subtitle/date line.
      if (subtitle) {
        const sfs = Math.max(12, base * 0.022);
        ctx.font = `400 ${sfs}px ${TYPOGRAPHY.primary}`;
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(subtitle.toUpperCase(), w / 2, titleY + tfs * 0.9);
      }
      ctx.restore();
    };

    if (scene.openingCard) {
      drawCard(
        scene.openingCard,
        openingCardWindow(scene.openingCard),
        scene.name
      );
    }
    if (scene.closingCard) {
      drawCard(
        scene.closingCard,
        closingCardWindow(scene.closingCard, scene.timeline.duration),
        DEFAULT_CLOSING_TITLE
      );
    }
  }
}
