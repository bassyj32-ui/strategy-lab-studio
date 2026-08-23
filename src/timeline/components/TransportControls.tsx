import { usePlaybackStore } from '../playbackStore';
import { formatTimecode, formatPlaybackMeta } from '../format';

/**
 * Play/pause, stop, frame-stepping, loop/snap toggles, and the timecode +
 * fps/duration readout. Icon-only buttons carry aria-labels (+ tooltips);
 * stepping and bounds jumps pause playback, matching scrub behaviour.
 */
export function TransportControls() {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const loop = usePlaybackStore((s) => s.loop);
  const snapToFrame = usePlaybackStore((s) => s.snapToFrame);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration = usePlaybackStore((s) => s.duration);
  const fps = usePlaybackStore((s) => s.fps);
  const toggle = usePlaybackStore((s) => s.toggle);
  const stop = usePlaybackStore((s) => s.stop);
  const setLoop = usePlaybackStore((s) => s.setLoop);
  const setSnapToFrame = usePlaybackStore((s) => s.setSnapToFrame);
  const stepFrames = usePlaybackStore((s) => s.stepFrames);
  const seekStart = usePlaybackStore((s) => s.seekStart);
  const seekEnd = usePlaybackStore((s) => s.seekEnd);

  return (
    <div
      className="transport-controls"
      data-testid="transport-controls"
    >
      <button
        type="button"
        className="step-btn"
        onClick={seekStart}
        aria-label="Jump to start"
        title="Jump to start (Home)"
      >
        ⏮
      </button>
      <button
        type="button"
        className="step-btn"
        onClick={() => stepFrames(-1)}
        aria-label="Step back one frame"
        title="Step back one frame (←)"
      >
        ◂
      </button>
      <button type="button" onClick={toggle}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        className="step-btn"
        onClick={() => stepFrames(1)}
        aria-label="Step forward one frame"
        title="Step forward one frame (→)"
      >
        ▸
      </button>
      <button
        type="button"
        className="step-btn"
        onClick={seekEnd}
        aria-label="Jump to end"
        title="Jump to end (End)"
      >
        ⏭
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
      <span className="playback-meta" data-testid="playback-meta">
        {formatPlaybackMeta(fps, duration)}
      </span>
    </div>
  );
}
