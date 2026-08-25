// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { TimelinePanel } from '../timeline';
import { usePlaybackStore } from '../timeline/playbackStore';
import { useSceneStore } from '../scene/store';
import { createDefaultScene } from '../scene/factory';
import { interpolateTransform } from '../render/interpolate';
import type { Transform } from '../scene/types';

/**
 * REGRESSION: the core user promise — "move asset A from point X to point Y".
 * Full pipeline through the real UI: select → Add @t0 → seek → drag (real
 * gesture path) → Add @t2 → interpolation must travel X..Y. Also locks in
 * Auto-KF recording the drag itself. Selection matters: with no selected
 * object every editor button is disabled (the "keyframes don't work" trap).
 */

const T = (x: number, y: number): Transform => ({
  x,
  y,
  rotation: 0,
  scale: 1,
  opacity: 1,
});

afterEach(cleanup);

function setup() {
  act(() => {
    usePlaybackStore.setState({
      currentTime: 0,
      isPlaying: false,
      duration: 10,
      fps: 10,
    });
    useSceneStore.setState({ scene: createDefaultScene(), past: [], future: [] });
    const layerId = useSceneStore.getState().activeLayerId;
    useSceneStore.getState().addObject({
      id: 'uA',
      type: 'unit',
      transform: T(100, 200),
      layerId,
    });
    useSceneStore.setState({ selectedObjId: 'uA' });
  });
}

describe('user flow: move unit A from X to Y with two keyframes', () => {
  beforeEach(setup);

  it('Add-keyframe-at-two-playhead-times animates X -> Y', () => {
    render(<TimelinePanel />);
    // Pose X at t=0
    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));
    expect(useSceneStore.getState().scene.keyframes['uA']).toHaveLength(1);
    // Seek to t=2 and drag the unit (real gesture path)
    act(() => usePlaybackStore.getState().seek(2));
    const st = useSceneStore.getState();
    act(() => {
      st.beginInteraction();
      st.updateTransform('uA', { x: 300, y: 500 });
      st.endInteraction();
    });
    // Pose Y at t=2
    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i }));

    const scene = useSceneStore.getState().scene;
    expect(scene.keyframes['uA']).toHaveLength(2);
    const base = T(100, 200);

    // Playback must TRAVEL: t=1 halfway, t>=2 exactly Y, t<=0 exactly X
    const at1 = interpolateTransform(scene.keyframes['uA'], 1, base)!;
    expect(at1.x).toBeCloseTo(200);
    expect(at1.y).toBeCloseTo(350);
    expect(interpolateTransform(scene.keyframes['uA'], 0, base)!.x).toBeCloseTo(100);
    expect(interpolateTransform(scene.keyframes['uA'], 2, base)!.x).toBeCloseTo(300);
  });

  it('Auto-KF mode records the drag itself (no manual second Add needed)', () => {
    render(<TimelinePanel />);
    fireEvent.click(screen.getByTestId('auto-keyframe-toggle'));
    expect(useSceneStore.getState().autoKeyframe).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /add keyframe/i })); // pose X @0

    act(() => usePlaybackStore.getState().seek(2));
    const st = useSceneStore.getState();
    act(() => {
      st.beginInteraction();
      st.updateTransform('uA', { x: 300, y: 500 });
      st.endInteraction(); // Auto-KF should stamp pose Y @2 HERE
    });

    const kfs = useSceneStore.getState().scene.keyframes['uA'];
    expect(kfs).toHaveLength(2);
    expect(kfs[1].time).toBe(2);
    expect(kfs[1].transform.x).toBe(300);
  });
});
