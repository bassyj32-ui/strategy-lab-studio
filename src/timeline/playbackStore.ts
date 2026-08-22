import { create } from 'zustand';

export interface PlaybackState {
  currentTime: number; // seconds, clamped to [0, duration]
  isPlaying: boolean;
  loop: boolean;
  snapToFrame: boolean; // when true, seek/tick quantize to frame grid
  duration: number; // mirror of scene.timeline.duration
  fps: number; // mirror of scene.timeline.fps

  play: () => void;
  pause: () => void;
  toggle: () => void;
  stop: () => void; // pause + seek(0)
  seek: (time: number, opts?: { snap?: boolean }) => void;
  setLoop: (loop: boolean) => void;
  setSnapToFrame: (snap: boolean) => void;
  tick: (deltaSeconds: number) => void; // advance; respects duration/loop
  syncTimeline: (duration: number, fps: number) => void;
}

const frameDuration = (fps: number): number => (fps > 0 ? 1 / fps : 0);

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function snap(v: number, fps: number): number {
  const fd = frameDuration(fps);
  if (fd === 0) return v;
  return Math.round(v / fd) * fd;
}

/**
 * TRANSIENT playback state. Never saved in the scene. This is THE editor
 * transport clock: it drives the timeline UI and is mirrored into the
 * preview <Player> (see render/PreviewPlayer.tsx). Headless export renders
 * frames independently and never reads this store.
 */
export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  currentTime: 0,
  isPlaying: false,
  loop: false,
  snapToFrame: false,
  duration: 0,
  fps: 30,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set((s) => ({ isPlaying: !s.isPlaying })),
  stop: () => {
    set({ isPlaying: false });
    get().seek(0);
  },
  seek: (time, opts) => {
    if (!Number.isFinite(time)) return; // NaN/Infinity must not poison currentTime
    const s = get();
    const useSnap = opts?.snap ?? s.snapToFrame;
    let t = clamp(time, 0, s.duration);
    if (useSnap) t = snap(t, s.fps);
    set({ currentTime: t });
  },
  setLoop: (loop) => set({ loop }),
  setSnapToFrame: (snapToFrame) => set({ snapToFrame }),
  tick: (deltaSeconds) => {
    const s = get();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (s.duration <= 0) {
      set({ currentTime: 0 });
      return;
    }
    let next = s.currentTime + deltaSeconds;
    const fd = frameDuration(s.fps);
    if (s.snapToFrame && fd > 0) next = snap(next, s.fps);

    if (next >= s.duration) {
      if (s.loop) {
        const wrapped = next - s.duration;
        set({ currentTime: s.snapToFrame && fd > 0 ? snap(wrapped, s.fps) : wrapped });
      } else {
        set({ currentTime: s.duration, isPlaying: false });
      }
    } else {
      set({ currentTime: next });
    }
  },
  syncTimeline: (duration, fps) => set({ duration, fps }),
}));
