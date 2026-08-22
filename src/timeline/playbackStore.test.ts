import { describe, it, expect, beforeEach } from 'vitest';
import { usePlaybackStore } from './playbackStore';

beforeEach(() => {
  usePlaybackStore.setState({
    currentTime: 0,
    isPlaying: false,
    loop: false,
    snapToFrame: false,
    duration: 10,
    fps: 10,
  });
});

describe('playbackStore', () => {
  it('seek clamps to [0, duration]', () => {
    const s = usePlaybackStore.getState();
    s.seek(-5);
    expect(usePlaybackStore.getState().currentTime).toBe(0);
    s.seek(100);
    expect(usePlaybackStore.getState().currentTime).toBe(10);
  });

  it('snapToFrame quantizes to the frame grid', () => {
    usePlaybackStore.setState({ snapToFrame: true, fps: 10 });
    usePlaybackStore.getState().seek(0.34);
    expect(usePlaybackStore.getState().currentTime).toBeCloseTo(0.3);
  });

  it('tick advances by the delta', () => {
    usePlaybackStore.getState().tick(1);
    expect(usePlaybackStore.getState().currentTime).toBeCloseTo(1);
  });

  it('tick auto-stops at the end when not looping', () => {
    usePlaybackStore.setState({ currentTime: 9 });
    usePlaybackStore.getState().tick(2);
    const st = usePlaybackStore.getState();
    expect(st.currentTime).toBe(10);
    expect(st.isPlaying).toBe(false);
  });

  it('tick wraps when looping', () => {
    usePlaybackStore.setState({ loop: true, currentTime: 9, isPlaying: true });
    usePlaybackStore.getState().tick(3);
    const st = usePlaybackStore.getState();
    expect(st.currentTime).toBeCloseTo(2); // 9 + 3 = 12 -> 12 - 10 = 2
    expect(st.isPlaying).toBe(true);
  });

  it('stop resets to 0 and pauses', () => {
    usePlaybackStore.setState({ isPlaying: true, currentTime: 5 });
    usePlaybackStore.getState().stop();
    const st = usePlaybackStore.getState();
    expect(st.currentTime).toBe(0);
    expect(st.isPlaying).toBe(false);
  });
});
