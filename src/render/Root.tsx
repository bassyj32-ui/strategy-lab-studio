import type { FC } from 'react';
import { Composition } from 'remotion';
import { BattleScene } from './BattleScene';
import type { BattleSceneProps } from './types';
import { getDefaultRenderProps, EXPORT_RESOLUTION } from './defaultProps';

/**
 * Forces ALPHA export mode regardless of `--props` (a `--props` file replaces
 * props wholesale, so relying on `exportMode` inside defaultProps alone would
 * silently fall back to standard mode). The scene stays the single source of
 * truth; only the paint mode is pinned here.
 */
const BattleSceneAlpha: FC<BattleSceneProps> = ({ scene }) => (
  <BattleScene scene={scene} exportMode="alpha" />
);

/**
 * Remotion root. Registers two Compositions over the SAME `BattleScene`
 * component (single source of truth for frames):
 *
 * - `BattleScene`      — standard mode: opaque background + map + objects.
 *                        Deterministic MP4 export (`npm run render`).
 * - `BattleSceneAlpha` — alpha mode (owner-approved P1 pull-forward): objects
 *                        only, transparent background. Render with an
 *                        alpha-capable codec, e.g.
 *                          npx remotion render src/render/index.ts BattleSceneAlpha \
 *                            out/overlay.mov --codec=prores --prores-profile=4444 \
 *                            --image-format=png --pixel-format=yuva444p10le
 *                        (see docs/rendering.md for all modes + trade-offs).
 *
 * Both share fps/duration derived from the scene's `timeline` via
 * `calculateMetadata`, so the same `--props=out/scene.props.json` works with
 * either composition id.
 *
 * Typed directly against Remotion's generics: `BattleScene` is
 * `FC<BattleSceneProps>` and `BattleSceneProps` satisfies the
 * `Record<string, unknown>` constraint, so no casting through `unknown`.
 */
export const RemotionRoot: FC = () => {
  return (
    <>
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
      <Composition
        id="BattleSceneAlpha"
        component={BattleSceneAlpha}
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
    </>
  );
};
