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
  // Section preview (Phase-1): In/Out window + looped playback inside it.
  const loopStart = usePlaybackStore((s) => s.loopStart);
  const loopEnd = usePlaybackStore((s) => s.loopEnd);
  const play = usePlaybackStore((s) => s.play);
  const setLoopRange = usePlaybackStore((s) => s.setLoopRange);
  const clearLoopRange = usePlaybackStore((s) => s.clearLoopRange);
  const seekRangeStart = usePlaybackStore((s) => s.seekRangeStart);
  const hasRange = loopStart !== null && loopEnd !== null;

  const playSection = () => {
    if (!hasRange) return;
    if (!loop) setLoop(true); // section preview only makes sense looped
    seekRangeStart();
    play();
  };

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
      <button
        type="button"
        className="step-btn"
        onClick={() => setLoopRange(currentTime, loopEnd ?? duration)}
        aria-label="Set section start at playhead"
        title="Set section start (In) at the playhead"
      >
        In
      </button>
      <button
        type="button"
        className="step-btn"
        onClick={() => setLoopRange(loopStart ?? 0, currentTime)}
        aria-label="Set section end at playhead"
        title="Set section end (Out) at the playhead"
      >
        Out
      </button>
      <button
        type="button"
        onClick={playSection}
        disabled={!hasRange}
        aria-label="Play looped section preview"
        title={
          hasRange
            ? 'Play the In–Out section on loop'
            : 'Set an In–Out section first'
        }
      >
        ▸§
      </button>
      {hasRange ? (
        <button
          type="button"
          className="step-btn"
          onClick={clearLoopRange}
          aria-label="Clear section"
          title="Clear the In–Out section (back to full timeline)"
        >
          ✕§
        </button>
      ) : null}
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
      {hasRange ? (
        <span
          className="playback-meta"
          data-testid="section-range"
          title="Section preview window (loops while Loop is on)"
        >
          § {formatTimecode(loopStart ?? 0)}–{formatTimecode(loopEnd ?? 0)}
        </span>
      ) : null}
      <span className="playback-meta" data-testid="playback-meta">
        {formatPlaybackMeta(fps, duration)}
      </span>
    </div>
  );
}
