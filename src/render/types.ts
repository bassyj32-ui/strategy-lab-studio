import type { Scene, AssetId } from '../scene/types';

/**
 * Props object passed to the `BattleScene` Remotion component.
 *
 * A TYPE ALIAS on purpose (not an interface): Remotion's `<Composition>`
 * constrains its props to `Record<string, unknown>`, which object-literal
 * aliases satisfy via implicit index signatures — interfaces do not.
 */
export type BattleSceneProps = {
  scene: Scene;
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
