/**
 * Audio playback engine: manages HTMLAudioElement instances synced to the
 * timeline clock. Reads from scene audioTracks + assets and the playback
 * store (currentTime, isPlaying). No React — pure class for easy testing.
 */

import type { Asset, AudioTrack } from '../scene/types';

interface ManagedClip {
  trackId: string;
  assetId: string;
  src: string;
  loop: boolean;
  element: HTMLAudioElement;
}

/**
 * Call `sync()` on every frame tick (or when time/isPlaying changes) to
 * keep clips aligned with the scene timeline. Clips outside the visible
 * window are paused and hidden; clips inside are seeked and played.
 */
export class AudioEngine {
  private clips = new Map<string, ManagedClip>();

  /**
   * Reconcile the live set of HTMLAudioElements with the scene's tracks.
   * Creates/removes elements as tracks change. Seeks and plays/pauses
   * based on current playback state.
   */
  sync(
    tracks: AudioTrack[],
    assets: Record<string, Asset>,
    time: number,
    isPlaying: boolean,
  ): void {
    const activeIds = new Set(tracks.map((t) => t.id));

    // Remove clips for deleted tracks.
    for (const [id, clip] of this.clips) {
      if (!activeIds.has(id)) {
        clip.element.pause();
        clip.element.src = '';
        this.clips.delete(id);
      }
    }

    // Create or update clips for each track.
    for (const track of tracks) {
      const asset = assets[track.assetId];
      if (!asset) continue;

      let clip = this.clips.get(track.id);

      // Create new element if needed or if src changed.
      if (!clip || clip.src !== asset.src) {
        clip?.element.pause();
        const el = new Audio(asset.src);
        el.loop = track.loop;
        clip = {
          trackId: track.id,
          assetId: track.assetId,
          src: asset.src,
          loop: track.loop,
          element: el,
        };
        this.clips.set(track.id, clip);
      }

      // Sync loop flag.
      if (clip.loop !== track.loop) {
        clip.element.loop = track.loop;
        clip.loop = track.loop;
      }

      // Calculate where the clip should be relative to the timeline.
      const clipTime = time - track.startTime;

      if (clipTime < 0) {
        // Before the clip starts — pause and seek to beginning.
        if (!clip.element.paused) clip.element.pause();
        clip.element.currentTime = 0;
      } else {
        // Within or past the clip — seek if needed, then play/pause.
        const targetTime = clip.element.duration
          ? clipTime % clip.element.duration
          : clipTime;
        if (Math.abs(clip.element.currentTime - targetTime) > 0.1) {
          clip.element.currentTime = targetTime;
        }
        clip.element.volume = track.volume;
        if (isPlaying && clip.element.paused) {
          clip.element.play().catch(() => {});
        } else if (!isPlaying && !clip.element.paused) {
          clip.element.pause();
        }
      }
    }
  }

  /** Pause all clips immediately. */
  pauseAll(): void {
    for (const clip of this.clips.values()) {
      clip.element.pause();
    }
  }

  /** Clean up all managed elements. Call on unmount. */
  dispose(): void {
    this.pauseAll();
    for (const clip of this.clips.values()) {
      clip.element.src = '';
    }
    this.clips.clear();
  }

  /** Number of active clips (for debugging). */
  get size(): number {
    return this.clips.size;
  }
}
