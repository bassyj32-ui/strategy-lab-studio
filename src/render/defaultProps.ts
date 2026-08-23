import type { Scene } from '../scene/types';
import { createDefaultScene } from '../scene/factory';
import type { ExportMode } from './types';

/**
 * Single source of truth for export resolution (MVP-1 = fixed 1080p).
 * Used by BOTH consumers: `Root.tsx` (Composition) and `PreviewPlayer.tsx`
 * (live preview), so the two can never drift apart.
 */
export const EXPORT_RESOLUTION = { width: 1920, height: 1080 } as const;

/**
 * Default props for the `BattleScene` Composition (used when no `--props`).
 * Standard mode: opaque background + map + objects, deterministic MP4.
 * Alpha exports override via `--props` with `"exportMode": "alpha"`.
 */
export function getDefaultRenderProps(): {
  scene: Scene;
  exportMode: ExportMode;
} {
  return { scene: createDefaultScene(), exportMode: 'standard' };
}

/**
 * Serialize props into the `--props` JSON file shape:
 * `{ "scene": <Scene>, "exportMode": "standard" | "alpha" }`.
 */
export function sceneToPropsFile(
  scene: Scene,
  exportMode: ExportMode = 'standard'
): string {
  return JSON.stringify({ scene, exportMode });
}
