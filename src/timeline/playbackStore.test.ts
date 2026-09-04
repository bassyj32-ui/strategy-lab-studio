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
    loopStart: null,
    loopEnd: null,
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

  it('setLoopRange clamps, orders and rejects degenerate windows', () => {
    const s = usePlaybackStore.getState();
    s.setLoopRange(2, 6);
    expect(usePlaybackStore.getState().loopStart).toBeCloseTo(2);
    expect(usePlaybackStore.getState().loopEnd).toBeCloseTo(6);
    // Degenerate (end <= start): keeps the old range.
    s.setLoopRange(6, 2);
    expect(usePlaybackStore.getState().loopStart).toBeCloseTo(2);
    // Out-of-bounds clamps to [0, duration].
    s.setLoopRange(-5, 50);
    expect(usePlaybackStore.getState().loopStart).toBe(0);
    expect(usePlaybackStore.getState().loopEnd).toBe(10);
    s.clearLoopRange();
    expect(usePlaybackStore.getState().loopStart).toBeNull();
    expect(usePlaybackStore.getState().loopEnd).toBeNull();
  });

  it('tick wraps inside the section when loop + range are set', () => {
    usePlaybackStore.setState({
      loop: true,
      isPlaying: true,
      currentTime: 5,
    });
    const s = usePlaybackStore.getState();
    s.setLoopRange(2, 6);
    s.tick(2); // 5 + 2 = 7 -> wraps to 2 + (7 - 6) = 3
    const st = usePlaybackStore.getState();
    expect(st.currentTime).toBeCloseTo(3);
    expect(st.isPlaying).toBe(true);
  });

  it('tick ignores the section when loop is off', () => {
    usePlaybackStore.setState({ currentTime: 5 });
    const s = usePlaybackStore.getState();
    s.setLoopRange(2, 6);
    s.tick(2); // 7: past the section end, but no loop -> plain advance
    expect(usePlaybackStore.getState().currentTime).toBeCloseTo(7);
  });

  it('seekRangeStart jumps to the section start (or 0)', () => {
    const s = usePlaybackStore.getState();
    s.setLoopRange(4, 8);
    usePlaybackStore.setState({ isPlaying: true, currentTime: 7 });
    usePlaybackStore.getState().seekRangeStart();
    const st = usePlaybackStore.getState();
    expect(st.currentTime).toBeCloseTo(4);
    expect(st.isPlaying).toBe(false);
  });
});
