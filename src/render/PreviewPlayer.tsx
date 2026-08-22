import { Player, type PlayerRef } from '@remotion/player';
import { useEffect, useRef, type FC } from 'react';
import type { Scene } from '../scene/types';
import { usePlaybackStore } from '../timeline/playbackStore';
import { BattleScene } from './BattleScene';
import { EXPORT_RESOLUTION } from './defaultProps';

/**
 * In-editor live preview. Wraps the exact same `BattleScene` component used
 * for headless export in a Remotion `<Player>`.
 *
 * SINGLE CLOCK RULE: the editor timeline (`usePlaybackStore`) is the only
 * transport. Its playhead is mirrored into the player via ref sync below;
 * the player's own control bar is hidden so there is exactly one play
 * button. Headless export ignores all of this and renders frames directly,
 * so determinism is unaffected.
 */
export const PreviewPlayer: FC<{ scene: Scene }> = ({ scene }) => {
  const playerRef = useRef<PlayerRef>(null);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const loop = usePlaybackStore((s) => s.loop);

  const fps = scene.timeline.fps;
  const durationInFrames = Math.max(
    1,
    Math.round(scene.timeline.duration * fps)
  );
  const frame = Math.min(
    durationInFrames - 1,
    Math.max(0, Math.round(currentTime * fps))
  );

  // One-way sync: store -> player. The player never writes back, so there is
  // no feedback loop and no second source of truth.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.getCurrentFrame() !== frame) p.seekTo(frame);
    if (isPlaying) {
      p.play();
    } else {
      p.pause();
    }
  }, [frame, isPlaying]);

  return (
    <Player
      ref={playerRef}
      component={BattleScene}
      inputProps={{ scene }}
      durationInFrames={durationInFrames}
      fps={fps}
      loop={loop}
      compositionWidth={EXPORT_RESOLUTION.width}
      compositionHeight={EXPORT_RESOLUTION.height}
      style={{ width: '100%', aspectRatio: '16/9' }}
    />
  );
};
