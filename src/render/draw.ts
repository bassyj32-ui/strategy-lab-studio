import type { Scene, Transform } from '../scene/types';
import type { AssetImageMap, ScreenTransform } from './types';
// Single consumption path (architecture §6.2): the SAME pure selector the
// timeline uses. Never duplicate interpolation math here.
import { getObjectTransformAtTime } from '../timeline/selectors';
import { applyCamera } from './camera';

const BACKGROUND = '#0b0e14';

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
 *   1. clear + fill background
 *   2. draw the map image (centered on world center; objects are NEVER baked in)
 *   3. for each layer (asc by `order`, skip invisible), for each object
 *      (asc by ObjId): interpolate -> project -> draw image or placeholder.
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
  images: AssetImageMap
): void {
  const { worldSize, camera } = scene;

  // 1. clear + background
  ctx.clearRect(0, 0, videoSize.w, videoSize.h);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, videoSize.w, videoSize.h);

  // 1b. LOUD deterministic failure banner: a scene that DECLARES a map but
  // whose map image is missing must never look like intentional art.
  if (scene.mapAssetId && !images[scene.mapAssetId]) {
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

  // 2. map image (centered at world center, never baked with objects)
  if (scene.mapAssetId) {
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
    const objIds = Object.keys(scene.objects)
      .filter((id) => scene.objects[id].layerId === layer.id)
      .sort();
    for (const id of objIds) {
      const obj = scene.objects[id];
      // Single consumption path (architecture.md §6.2): the Remotion render
      // reads animation through the SAME pure selector as the editor preview.
      const world = getObjectTransformAtTime(scene, id, t);
      const screen: ScreenTransform = applyCamera(
        world,
        camera,
        worldSize,
        videoSize
      );

      ctx.save();
      ctx.globalAlpha = screen.opacity;
      ctx.translate(screen.x, screen.y);
      ctx.rotate((screen.rotation * Math.PI) / 180);

      const img = obj.assetId ? images[obj.assetId] : null;
      if (img) {
        const asset = obj.assetId ? scene.assets[obj.assetId] : undefined;
        const w = (asset?.width ?? img.width) * screen.scale;
        const h = (asset?.height ?? img.height) * screen.scale;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else {
        const size = PLACEHOLDER_SIZE * screen.scale;
        ctx.fillStyle = PLACEHOLDER_COLORS[obj.type] ?? '#888888';
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }
      ctx.restore();
    }
  }
}
