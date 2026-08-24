// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { TimelinePanel } from './TimelinePanel';
import { usePlaybackStore } from '../playbackStore';
import { useSceneStore } from '../../scene/store';
import { createDefaultScene } from '../../scene/factory';

/**
 * Keyboard transport + first-run coaching tests. The panel syncs the scene
 * timeline on mount, so the effective grid is duration 10s @ 30 fps
 * (one frame = 1/30 s).
 */
const FRAME = 1 / 30;

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
  });
});

/** Focus an element inside the panel so panel-scoped keys are active. */
function focusInside(): HTMLElement {
  const ruler = screen.getByTestId('timeline-ruler');
  ruler.focus();
  return ruler;
}

describe('TimelinePanel keyboard transport', () => {
  it('Space toggles play/pause when focus is inside the panel', () => {
    render(<TimelinePanel />);
    const ruler = focusInside();
    fireEvent.keyDown(ruler, { key: ' ' });
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    fireEvent.keyDown(ruler, { key: ' ' });
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it('←/→ step exactly one frame (ruler handles first; panel does not double-step)', () => {
    render(<TimelinePanel />);
    act(() => {
      // Mid-timeline so both directions have room.
      usePlaybackStore.setState({ currentTime: 5, fps: 30 });
    });
    const ruler = focusInside();
    fireEvent.keyDown(ruler, { key: 'ArrowRight' });
    expect(usePlaybackStore.getState().currentTime).toBeCloseTo(5 + FRAME);
    fireEvent.keyDown(ruler, { key: 'ArrowLeft' });
    expect(usePlaybackStore.getState().currentTime).toBeCloseTo(5);
    // Stepping pauses playback.
    act(() => {
      usePlaybackStore.setState({ isPlaying: true });
    });
    fireEvent.keyDown(ruler, { key: 'ArrowLeft' });
    const st = usePlaybackStore.getState();
    expect(st.isPlaying).toBe(false);
    expect(st.currentTime).toBeCloseTo(5 - FRAME);
  });

  it('Home/End jump to the bounds', () => {
    render(<TimelinePanel />);
    act(() => {
      usePlaybackStore.setState({ currentTime: 4, isPlaying: true });
    });
    const ruler = focusInside();
    fireEvent.keyDown(ruler, { key: 'End' });
    let st = usePlaybackStore.getState();
    expect(st.currentTime).toBe(10);
    expect(st.isPlaying).toBe(false);
    fireEvent.keyDown(ruler, { key: 'Home' });
    st = usePlaybackStore.getState();
    expect(st.currentTime).toBe(0);
  });

  it('ignores timeline keys while typing in inputs inside the panel', () => {
    render(<TimelinePanel />);
    // The Loop checkbox is a real <input> inside the panel.
    const loopInput = screen.getByLabelText('Loop');
    loopInput.focus();
    fireEvent.keyDown(loopInput, { key: ' ' });
    fireEvent.keyDown(loopInput, { key: 'ArrowRight' });
    const st = usePlaybackStore.getState();
    expect(st.isPlaying).toBe(false); // Space must not toggle
    expect(st.currentTime).toBe(0); // ←/→ must not step
  });

  it('shows the keyboard hint row behind the ? toggle', () => {
    render(<TimelinePanel />);
    // Hidden by default (de-cluttered timeline).
    expect(screen.queryByTestId('timeline-keyboard-hints')).toBeNull();
    fireEvent.click(screen.getByTestId('hints-toggle'));
    const hints = screen.getByTestId('timeline-keyboard-hints');
    expect(hints.textContent).toContain('Space');
    expect(hints.textContent).toContain('step frame');
    expect(hints.textContent).toContain('Home');
    expect(hints.textContent).toContain('End');
    // Toggle closes it again.
    fireEvent.click(screen.getByTestId('hints-toggle'));
    expect(screen.queryByTestId('timeline-keyboard-hints')).toBeNull();
  });

  it('shows coaching line when the scene has zero objects', () => {
    act(() => {
      useSceneStore.setState({
        scene: { ...createDefaultScene(), objects: {} },
        past: [],
        future: [],
      });
    });
    render(<TimelinePanel />);
    expect(screen.getByTestId('empty-coaching').textContent).toBe(
      'Place a unit, select it, then Add keyframe at playhead.',
    );
  });

  it('keyboard shortcuts do not fire when focus is outside the panel', () => {
    render(
      <div>
        <div tabIndex={0} data-testid="outside" />
        <TimelinePanel />
      </div>,
    );
    const outside = screen.getByTestId('outside');
    outside.focus();
    // Sanity: jsdom keeps activeElement on the outside node.
    expect(document.activeElement).toBe(outside);
    // Dispatch from outside — no panel handler in the bubble path.
    fireEvent.keyDown(outside, { key: ' ' });
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });
});
