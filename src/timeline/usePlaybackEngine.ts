import { useEffect, useRef } from 'react';
import { usePlaybackStore } from './playbackStore';

/**
 * Drives the playback clock with a single requestAnimationFrame loop, active
 * only while `isPlaying`. Uses real frame deltas -> deterministic given the
 * same start state and deltas. Guarded for non-DOM environments.
 */
export function usePlaybackEngine(): void {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined') return;

    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    lastRef.current = performance.now();
    const loop = (now: number): void => {
      // Clamp the raw delta: after tab-background/throttle resume one huge gap
      // would otherwise jump currentTime to the end and auto-stop playback
      // (smoothness budget PRD §97).
      const rawDelta = (now - lastRef.current) / 1000;
      const delta = Math.min(0.25, Math.max(0, rawDelta));
      lastRef.current = now;
      usePlaybackStore.getState().tick(delta);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying]);
}
