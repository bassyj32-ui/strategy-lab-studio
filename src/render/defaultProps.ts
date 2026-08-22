import type { Scene } from '../scene/types';
import { createDefaultScene } from '../scene/factory';

/**
 * Single source of truth for export resolution (MVP-1 = fixed 1080p).
 * Used by BOTH consumers: `Root.tsx` (Composition) and `PreviewPlayer.tsx`
 * (live preview), so the two can never drift apart.
 */
export const EXPORT_RESOLUTION = { width: 1920, height: 1080 } as const;

/** Default props for the `BattleScene` Composition (used when no `--props`). */
export function getDefaultRenderProps(): { scene: Scene } {
  return { scene: createDefaultScene() };
}

/** Serialize a scene into the `--props` JSON file shape: `{ "scene": <Scene> }`. */
export function sceneToPropsFile(scene: Scene): string {
  return JSON.stringify({ scene });
}
