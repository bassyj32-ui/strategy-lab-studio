import type { FC } from 'react';
import { Composition } from 'remotion';
import { BattleScene } from './BattleScene';
import { getDefaultRenderProps, EXPORT_RESOLUTION } from './defaultProps';

/**
 * Remotion root. Registers the `BattleScene` Composition whose fps/duration are
 * derived from the scene's `timeline` via `calculateMetadata` (so the same
 * Composition works with default props AND with `--props=out/scene.props.json`).
 *
 * Typed directly against Remotion's generics: `BattleScene` is
 * `FC<BattleSceneProps>` and `BattleSceneProps` satisfies the
 * `Record<string, unknown>` constraint, so no casting through `unknown`.
 */
export const RemotionRoot: FC = () => {
  return (
    <Composition
      id="BattleScene"
      component={BattleScene}
      defaultProps={getDefaultRenderProps()}
      fps={30}
      durationInFrames={300}
      width={EXPORT_RESOLUTION.width}
      height={EXPORT_RESOLUTION.height}
      calculateMetadata={({ props }) => {
        const scene = props.scene;
        return {
          fps: scene.timeline.fps,
          durationInFrames: Math.round(
            scene.timeline.duration * scene.timeline.fps
          ),
          width: EXPORT_RESOLUTION.width,
          height: EXPORT_RESOLUTION.height,
        };
      }}
    />
  );
};
