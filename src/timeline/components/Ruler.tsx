import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { usePlaybackStore } from '../playbackStore';
import { usePlaybackTime } from '../usePlaybackTime';

const TICKS = 10;

/**
 * Time ruler with a playhead. Click/drag scrubs (seeks) — clamped to
 * [0, duration]. MVP-1 pauses playback on scrub-start for predictability.
 */
export function Ruler() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Consume-once flag: browsers with PointerEvents fire pointerdown and then a
  // synthesized mousedown for the same press; without this each click would
  // scrub twice (harmless but wasteful — see review note #6).
  const mouseSuppressedRef = useRef(false);
  const currentTime = usePlaybackTime();
  const duration = usePlaybackStore((s) => s.duration);
  const seek = usePlaybackStore((s) => s.seek);
  const pause = usePlaybackStore((s) => s.pause);

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

  return (
    <div
      className="ruler"
      ref={trackRef}
      data-testid="timeline-ruler"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
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
      style={{
        position: 'relative',
        height: 28,
        background: '#20242c',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {Array.from({ length: TICKS + 1 }, (_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${(i / TICKS) * 100}%`,
            bottom: 0,
            width: 1,
            height: i % (TICKS / 2) === 0 ? 12 : 6,
            background: '#5a6272',
          }}
        />
      ))}
      <div
        className="playhead"
        data-testid="playhead"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${pct}%`,
          width: 2,
          background: '#ff5566',
        }}
      />
    </div>
  );
}
