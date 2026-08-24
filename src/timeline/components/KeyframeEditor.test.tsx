// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { KeyframeEditor } from './KeyframeEditor';
import { useSceneStore } from '../../scene/store';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../../scene/factory';
import { useTimelineSelection } from '../selection';

afterEach(cleanup);

beforeEach(() => {
  act(() => {
    useSceneStore.setState({
      scene: createDefaultScene(),
      past: [],
      future: [],
      selectedObjId: null,
      activeLayerId: DEFAULT_LAYER_ID,
    });
    useTimelineSelection.setState({
      selectedObjId: null,
      selectedKeyframeTime: null,
    });
  });
});

/** One object with keyframes at t=0 and t=10. */
function mkAnimated(): string {
  let id = '';
  act(() => {
    id = useSceneStore.getState().createObjectOfType('shape');
    const s = useSceneStore.getState();
    s.addKeyframe(id, {
      time: 0,
      transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
    });
    s.addKeyframe(id, {
      time: 10,
      transform: { x: 100, y: 0, rotation: 0, scale: 1, opacity: 1 },
    });
  });
  return id;
}

describe('KeyframeEditor easing select (P0 basic easing)', () => {
  it('select is disabled until an object + keyframe are selected', () => {
    render(<KeyframeEditor />);
    expect((screen.getByTestId('kf-easing') as HTMLSelectElement).disabled).toBe(true);

    const id = mkAnimated();
    act(() => {
      useTimelineSelection.getState().selectObject(id);
      useTimelineSelection.getState().selectKeyframe(0);
    });
    expect((screen.getByTestId('kf-easing') as HTMLSelectElement).disabled).toBe(false);
  });

  it('shows the stored easing and defaults to Linear', () => {
    const id = mkAnimated();
    render(<KeyframeEditor />);
    act(() => {
      useTimelineSelection.getState().selectObject(id);
      useTimelineSelection.getState().selectKeyframe(0);
    });
    expect((screen.getByTestId('kf-easing') as HTMLSelectElement).value).toBe('linear');
  });

  it('changing the dropdown persists easing on the keyframe', () => {
    const id = mkAnimated();
    render(<KeyframeEditor />);
    act(() => {
      useTimelineSelection.getState().selectObject(id);
      useTimelineSelection.getState().selectKeyframe(0);
    });

    fireEvent.change(screen.getByTestId('kf-easing'), {
      target: { value: 'easeIn' },
    });
    expect(useSceneStore.getState().scene.keyframes[id][0].easing).toBe('easeIn');
    expect((screen.getByTestId('kf-easing') as HTMLSelectElement).value).toBe('easeIn');

    fireEvent.change(screen.getByTestId('kf-easing'), { target: { value: 'hold' } });
    expect(useSceneStore.getState().scene.keyframes[id][0].easing).toBe('hold');
  });

  it('reflects the easing of whichever keyframe is selected', () => {
    const id = mkAnimated();
    act(() => {
      useSceneStore.getState().updateKeyframe(id, 10, { easing: 'easeOut' });
    });
    render(<KeyframeEditor />);
    act(() => {
      useTimelineSelection.getState().selectObject(id);
      useTimelineSelection.getState().selectKeyframe(0);
    });
    expect((screen.getByTestId('kf-easing') as HTMLSelectElement).value).toBe('linear');

    act(() => useTimelineSelection.getState().selectKeyframe(10));
    expect((screen.getByTestId('kf-easing') as HTMLSelectElement).value).toBe('easeOut');
  });
});
