import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { usePlaybackStore } from '../playbackStore';
import { usePlaybackTime } from '../usePlaybackTime';
import { formatTimecode } from '../format';

const TICKS = 10;

/**
 * Time ruler with a playhead. Click/drag scrubs (seeks) — clamped to
 * [0, duration]. Arrow keys seek frame-by-frame when focused. MVP-1 pauses
 * playback on scrub-start for predictability.
 */
export function Ruler() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Consume-once flag: browsers with PointerEvents fire pointerdown and then a
  // synthesized mousedown for the same press; without this each click would
  // scrub twice (harmless but wasteful — see review note #6).
  const mouseSuppressedRef = useRef(false);
  const currentTime = usePlaybackTime();
  const duration = usePlaybackStore((s) => s.duration);
  const fps = usePlaybackStore((s) => s.fps);
  const seek = usePlaybackStore((s) => s.seek);
  const pause = usePlaybackStore((s) => s.pause);
  const loopStart = usePlaybackStore((s) => s.loopStart);
  const loopEnd = usePlaybackStore((s) => s.loopEnd);

  const seekFromClientX = (clientX: number): void => {
    const el = trackRef.current;
    if (!el || duration <= 0) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const beginScrub = (clientX: number): void => {
    pause(); // MVP-1: pause on scrub-start for predictability
    seekFromClientX(clientX);
  };

  // Keyboard alternative to drag-scrubbing: ±1 frame, Home/End to bounds.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (duration <= 0) return;
    const frame = fps > 0 ? 1 / fps : 0.1;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      pause();
      seek(currentTime - frame);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      pause();
      seek(currentTime + frame);
    } else if (e.key === 'Home') {
      e.preventDefault();
      pause();
      seek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      pause();
      seek(duration);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    mouseSuppressedRef.current = true; // swallow the synthesized follow-up mousedown
    beginScrub(e.clientX);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture unsupported (e.g. jsdom) — scrubbing still works.
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.buttons % 2 === 1) seekFromClientX(e.clientX); // primary button held
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hasRange =
    loopStart !== null && loopEnd !== null && loopEnd > loopStart && duration > 0;
  const rangeLeft = hasRange ? (loopStart! / duration) * 100 : 0;
  const rangeWidth = hasRange ? ((loopEnd! - loopStart!) / duration) * 100 : 0;

  return (
    <div
      className="ruler"
      ref={trackRef}
      data-testid="timeline-ruler"
      role="slider"
      tabIndex={0}
      aria-label="Timeline position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 1000) / 1000}
      aria-valuenow={Math.round(currentTime * 1000) / 1000}
      aria-valuetext={formatTimecode(currentTime)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      // Mouse-event aliases: identical behaviour, deterministic under jsdom
      // where PointerEvent init props are unreliable.
      onMouseDown={(e) => {
        // jsdom / pointer-less environments never set the flag, so mouse
        // scrubbing still works there; real browsers already scrubbed via
        // pointerdown and skip this duplicate.
        if (!mouseSuppressedRef.current) beginScrub(e.clientX);
        mouseSuppressedRef.current = false;
      }}
      onMouseMove={(e) => {
        if (e.buttons % 2 === 1) seekFromClientX(e.clientX);
      }}
    >
      {Array.from({ length: TICKS + 1 }, (_, i) => (
        <div
          key={i}
          className={i % (TICKS / 2) === 0 ? 'ruler-tick major' : 'ruler-tick'}
          style={{ left: `${(i / TICKS) * 100}%` }}
        />
      ))}
      {hasRange ? (
        <div
          className="ruler-range"
          data-testid="ruler-range"
          title="Section preview window"
          style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }}
        />
      ) : null}
      <div
        className="playhead"
        data-testid="playhead"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
