import { usePlaybackStore } from './playbackStore';

/**
 * Subscribe to the current playback time. The canvas preview and any time-
 * dependent UI read the clock through this hook (or the store directly).
 */
export function usePlaybackTime(): number {
  return usePlaybackStore((s) => s.currentTime);
}
