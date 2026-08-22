import { staticFile } from 'remotion';
import type { Scene, AssetId } from '../scene/types';
import type { AssetImageMap } from './types';

/**
 * Resolve an asset's `src` to a URL that actually loads in the current context.
 *
 * - `blob:` / `data:` / `http(s):` URLs pass through UNCHANGED. Remotion's
 *   `staticFile()` would corrupt these into same-origin paths (`/blob:...`)
 *   that resolve to a guaranteed 404 — which silently made every imported
 *   map/sprite unrenderable in both preview and export.
 * - Anything else is treated as a path into Remotion's `public/` directory
 *   (via `staticFile()`), so disk-backed assets resolve identically in the
 *   headless render and the in-editor `<Player>`.
 */
export function resolveAssetUrl(src: string): string {
  return /^(blob|data|https?):/i.test(src) ? src : staticFile(src);
}

/**
 * Load all images referenced by the scene (the map asset + every object's
 * asset) into `HTMLImageElement`s, then call `onReady` exactly ONCE with:
 *   - `images`: assetId -> HTMLImageElement | null (null = failed or missing)
 *   - `failedIds`: every assetId that could NOT be loaded
 *
 * A failure NEVER hangs the frame (the renderer draws placeholders instead),
 * but each failure is logged exactly once so placeholder art is always
 * diagnosable rather than silent.
 */
export function loadSceneImages(
  scene: Scene,
  onReady: (images: AssetImageMap, failedIds: AssetId[]) => void
): void {
  const ids = new Set<AssetId>();
  if (scene.mapAssetId) ids.add(scene.mapAssetId);
  for (const obj of Object.values(scene.objects)) {
    if (obj.assetId) ids.add(obj.assetId);
  }

  const result: AssetImageMap = {};
  const failedIds: AssetId[] = [];
  const list = Array.from(ids);
  if (list.length === 0) {
    onReady(result, failedIds);
    return;
  }

  let remaining = list.length;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onReady(result, failedIds);
  };
  const markDone = () => {
    remaining -= 1;
    if (remaining === 0) finish();
  };
  const markFailed = (id: AssetId) => {
    if (!failedIds.includes(id)) {
      failedIds.push(id);
      // Loud-but-non-fatal diagnostics; placeholders remain visible.
      console.warn(`[render] asset failed to load: ${id}`);
    }
    result[id] = null;
    markDone();
  };

  for (const id of list) {
    const asset = scene.assets[id];
    if (!asset) {
      markFailed(id);
      continue;
    }
    const img = new Image();
    img.onload = () => {
      result[id] = img;
      markDone();
    };
    img.onerror = () => {
      markFailed(id);
    };
    img.src = resolveAssetUrl(asset.src);
  }
}

/**
 * Hard integrity gate for HEADLESS EXPORT ONLY (isRendering === true).
 *
 * If the map asset failed to load, exporting would confidently encode a video
 * of colored placeholder squares. That is worse than failing: refuse to
 * produce silent-placeholder footage. The editor `<Player>` passes
 * isRendering=false and keeps editing with warn-once + on-canvas banner.
 */
export function assertExportIntegrity(
  scene: Scene,
  images: AssetImageMap,
  isRendering: boolean
): void {
  if (!isRendering || !scene.mapAssetId) return;
  if (!images[scene.mapAssetId]) {
    const asset = scene.assets[scene.mapAssetId];
    throw new Error(
      `[render] Export aborted: MAP asset "${
        asset?.name ?? scene.mapAssetId
      }" failed to load (src: ${asset?.src ?? 'not in registry'}). ` +
        'Refusing to export placeholder footage. Headless export needs ' +
        'self-contained assets (data: URLs from import, or disk-backed public/ ' +
        'files) — browser-only blob: URLs cannot be resolved here.'
    );
  }
}
