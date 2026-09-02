import { useSceneStore } from '../../scene/store';
import type { AudioTrack } from '../../scene/types';
import { formatDuration } from '../../audio/freesound';

/**
 * Audio track row in the timeline: shows a colored bar at the correct time
 * position with the clip name, duration, and a remove button.
 */
export function AudioTrackRow({ track }: { track: AudioTrack }) {
  const asset = useSceneStore((s) => s.scene.assets[track.assetId]);
  const duration = useSceneStore((s) => s.scene.timeline.duration);
  const removeAudioTrack = useSceneStore((s) => s.removeAudioTrack);
  const updateAudioTrack = useSceneStore((s) => s.updateAudioTrack);

  if (!asset) return null;

  const clipDuration = asset.duration ?? 3;
  const startPct = (track.startTime / duration) * 100;
  const widthPct = (clipDuration / duration) * 100;

  return (
    <div className="audio-track-row" data-testid={`audio-track-${track.id}`}>
      <div className="audio-track-label">
        <span className="audio-track-name">{track.name ?? asset.name}</span>
        <span className="audio-track-duration">
          {formatDuration(clipDuration)}
        </span>
      </div>
      <div className="audio-track-bar-container">
        <div
          className="audio-track-bar"
          style={{
            left: `${startPct}%`,
            width: `${widthPct}%`,
          }}
        >
          <span className="audio-track-bar-label">{track.name ?? asset.name}</span>
        </div>
      </div>
      <div className="audio-track-controls">
        <label className="audio-volume-label" title="Volume">
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={track.volume}
            onChange={(e) =>
              updateAudioTrack(track.id, { volume: Number(e.target.value) })
            }
            className="audio-volume-slider"
          />
        </label>
        <button
          type="button"
          className="btn btn-xs"
          onClick={() => removeAudioTrack(track.id)}
          title="Remove track"
        >
          ×
        </button>
      </div>
    </div>
  );
}
