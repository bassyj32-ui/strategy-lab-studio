import { usePlaybackStore } from '../playbackStore';
import { formatTimecode } from '../format';

/** Play/pause, stop, loop + snap toggles, and the timecode readout. */
export function TransportControls() {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const loop = usePlaybackStore((s) => s.loop);
  const snapToFrame = usePlaybackStore((s) => s.snapToFrame);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration = usePlaybackStore((s) => s.duration);
  const toggle = usePlaybackStore((s) => s.toggle);
  const stop = usePlaybackStore((s) => s.stop);
  const setLoop = usePlaybackStore((s) => s.setLoop);
  const setSnapToFrame = usePlaybackStore((s) => s.setSnapToFrame);

  return (
    <div
      className="transport-controls"
      data-testid="transport-controls"
      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
    >
      <button type="button" onClick={toggle}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button type="button" onClick={stop}>
        Stop
      </button>
      <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => setLoop(e.target.checked)}
        />
        Loop
      </label>
      <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={snapToFrame}
          onChange={(e) => setSnapToFrame(e.target.checked)}
        />
        Snap to frame
      </label>
      <span className="timecode" data-testid="timecode">
        {formatTimecode(currentTime)} / {formatTimecode(duration)}
      </span>
    </div>
  );
}
