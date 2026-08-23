// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { TransportControls } from './TransportControls';
import { usePlaybackStore } from '../playbackStore';

afterEach(cleanup);

beforeEach(() => {
  act(() => {
    usePlaybackStore.setState({
      currentTime: 0,
      isPlaying: false,
      loop: false,
      snapToFrame: false,
      duration: 2,
      fps: 10,
    });
  });
});

describe('TransportControls frame stepping', () => {
  it('shows fps and duration beside the timecode', () => {
    render(<TransportControls />);
    const meta = screen.getByTestId('playback-meta');
    expect(meta.textContent).toContain('10 fps');
    expect(meta.textContent).toContain('2.0 s');
  });

  it('+1 frame button advances exactly one frame and pauses playback', () => {
    act(() => {
      usePlaybackStore.setState({ isPlaying: true });
    });
    render(<TransportControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Step forward one frame' }));
    const st = usePlaybackStore.getState();
    expect(st.currentTime).toBeCloseTo(0.1); // one frame at 10 fps
    expect(st.isPlaying).toBe(false); // stepping is manual control
  });

  it('−1 frame button steps back; at time 0 it clamps to 0', () => {
    render(<TransportControls />);
    const back = screen.getByRole('button', { name: 'Step back one frame' });
    // With room to step:
    act(() => {
      usePlaybackStore.setState({ currentTime: 0.25 });
    });
    fireEvent.click(back);
    expect(usePlaybackStore.getState().currentTime).toBeCloseTo(0.15);
    // At the lower bound it must not go negative:
    act(() => {
      usePlaybackStore.setState({ currentTime: 0 });
    });
    fireEvent.click(back);
    expect(usePlaybackStore.getState().currentTime).toBe(0);
  });

  it('jump-to-start / jump-to-end buttons seek the bounds and pause', () => {
    act(() => {
      usePlaybackStore.setState({ currentTime: 1, isPlaying: true });
    });
    render(<TransportControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to end' }));
    let st = usePlaybackStore.getState();
    expect(st.currentTime).toBe(2);
    expect(st.isPlaying).toBe(false);
    act(() => {
      usePlaybackStore.setState({ isPlaying: true });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Jump to start' }));
    st = usePlaybackStore.getState();
    expect(st.currentTime).toBe(0);
    expect(st.isPlaying).toBe(false);
  });

  it('stepping respects snapToFrame by landing on the frame grid', () => {
    act(() => {
      usePlaybackStore.setState({ snapToFrame: true, currentTime: 0.34 });
    });
    render(<TransportControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Step forward one frame' }));
    // 0.34 + 0.1 = 0.44 -> snapped to nearest frame at 10 fps -> 0.4
    expect(usePlaybackStore.getState().currentTime).toBeCloseTo(0.4);
  });
});
