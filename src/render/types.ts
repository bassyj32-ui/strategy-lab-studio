import type { Scene, AssetId } from '../scene/types';

/**
 * Export mode (owner-approved P1 pull-forward).
 * - `standard`: opaque background + map + objects -> deterministic MP4.
 * - `alpha`: objects only, transparent background -> overlay footage for
 *   layering in external tools (ProRes 4444 / VP9 / PNG sequence).
 */
export type ExportMode = 'standard' | 'alpha';

/**
 * Props object passed to the `BattleScene` Remotion component.
 *
 * A TYPE ALIAS on purpose (not an interface): Remotion's `<Composition>`
 * constrains its props to `Record<string, unknown>`, which object-literal
 * aliases satisfy via implicit index signatures — interfaces do not.
 */
export type BattleSceneProps = {
  scene: Scene;
  /** Defaults to `'standard'` when omitted. */
  exportMode?: ExportMode;
};

/**
 * A transform already projected into screen (pixel) space, ready to be applied
 * to a canvas context (translate/rotate/scale/alpha).
 */
export interface ScreenTransform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
}

/** Resolved asset id -> loaded HTMLImageElement (null = missing/errored). */
export type AssetImageMap = Record<AssetId, HTMLImageElement | null>;
