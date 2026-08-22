// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { TimelinePanel } from './TimelinePanel';
import { usePlaybackStore } from '../playbackStore';
import { useSceneStore } from '../../scene/store';
import { createDefaultScene } from '../../scene/factory';
import type { Transform } from '../../scene/types';

const T: Transform = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };

afterEach(cleanup);

beforeEach(() => {
  act(() => {
    usePlaybackStore.setState({
      currentTime: 0,
      isPlaying: false,
      loop: false,
      snapToFrame: false,
      duration: 10,
      fps: 10,
    });
    useSceneStore.setState({ scene: createDefaultScene(), past: [], future: [] });
    useSceneStore.getState().addObject({
      id: 'u1',
      type: 'unit',
      transform: T,
      layerId: useSceneStore.getState().activeLayerId,
    });
  });
});

describe('TimelinePanel', () => {
  it('renders transport controls and ruler with one track per object', () => {
    render(<TimelinePanel />);
    expect(screen.getByTestId('transport-controls')).toBeTruthy();
    expect(screen.getByTestId('timeline-ruler')).toBeTruthy();
    expect(screen.getByTestId('keyframe-track-u1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('clicking play sets isPlaying; clicking again pauses', () => {
    render(<TimelinePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it('clicking the ruler seeks to the clicked time and pauses', () => {
    render(<TimelinePanel />);
    act(() => {
      usePlaybackStore.setState({ isPlaying: true });
    });
    const ruler = screen.getByTestId('timeline-ruler');
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 100,
      bottom: 28,
      width: 100,
      height: 28,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // mousedown alias: MouseEvent reliably carries clientX under jsdom.
    fireEvent.mouseDown(ruler, { clientX: 50, button: 0, buttons: 1 });

    const st = usePlaybackStore.getState();
    expect(st.currentTime).toBeCloseTo(st.duration * 0.5);
    expect(st.isPlaying).toBe(false); // scrub-start pauses
  });

  it('add-keyframe button writes into scene.keyframes via the store', () => {
    render(<TimelinePanel />);
    // Select object u1 by clicking its track label, then stamp at playhead 0.
    fireEvent.click(screen.getByText('u1'));
    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));

    const kfs = useSceneStore.getState().scene.keyframes['u1'];
    expect(kfs).toHaveLength(1);
    expect(kfs[0].time).toBe(0);
  });
});
