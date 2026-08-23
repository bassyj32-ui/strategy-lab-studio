// @vitest-environment jsdom
// Regression tests for UNIFIED SELECTION across components.
//
// Bugs covered:
//  - Bug 1: Toolbar click-to-place created an object but never selected it,
//    so the Inspector stayed on "No object selected".
//  - Bug 2 (timeline side): clicking a KeyframeTrack label selected only for
//    the timeline; the Inspector/canvas did not follow.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { Toolbar } from '../../ui/Toolbar';
import { KeyframeTrack } from './KeyframeTrack';
import { KeyframeEditor } from './KeyframeEditor';
import { useSceneStore } from '../../scene/store';
import { createDefaultScene } from '../../scene/factory';
import { useTimelineSelection } from '../selection';

afterEach(cleanup);

beforeEach(() => {
  act(() => {
    useSceneStore.setState({
      scene: createDefaultScene(),
      past: [],
      future: [],
      selectedObjId: null,
    });
    useTimelineSelection.setState({ selectedObjId: null, selectedKeyframeTime: null });
  });
});

describe('selection sync (component level)', () => {
  it('BUG 1: toolbar click-to-place creates AND selects the new object', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('palette-shape'));

    const st = useSceneStore.getState();
    const ids = Object.keys(st.scene.objects);
    expect(ids).toHaveLength(1);
    // Scene store: Inspector + canvas outline now target the new object.
    expect(st.selectedObjId).toBe(ids[0]);
    // Timeline store: KeyframeEditor targets it too.
    expect(useTimelineSelection.getState().selectedObjId).toBe(ids[0]);
  });

  it('BUG 1: keyboard placement (Enter) selects the new object too', () => {
    render(<Toolbar />);
    const item = screen.getByTestId('palette-marker');
    fireEvent.keyDown(item, { key: 'Enter' });

    const st = useSceneStore.getState();
    const ids = Object.keys(st.scene.objects);
    expect(ids).toHaveLength(1);
    expect(st.selectedObjId).toBe(ids[0]);
    expect(useTimelineSelection.getState().selectedObjId).toBe(ids[0]);
  });

  it('BUG 2: clicking a track label selects the object for the Inspector too', () => {
    act(() => {
      useSceneStore.getState().addObject({
        id: 'u1',
        type: 'unit',
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
        layerId: useSceneStore.getState().activeLayerId,
      });
    });
    render(<KeyframeTrack objId="u1" />);

    fireEvent.click(screen.getByTestId('track-select-u1'));

    // Timeline store (track highlight / KeyframeEditor)...
    expect(useTimelineSelection.getState().selectedObjId).toBe('u1');
    // ...AND scene store (Inspector + canvas outline) agree.
    expect(useSceneStore.getState().selectedObjId).toBe('u1');
  });

  it('keyframe buttons enable from ANY selection path', () => {
    // Path A: place via the toolbar.
    render(
      <>
        <Toolbar />
        <KeyframeTrack objId="u1" />
        <KeyframeEditor />
      </>
    );
    const addBtn = screen.getByRole('button', { name: /add keyframe at playhead/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true); // nothing selected yet

    fireEvent.click(screen.getByTestId('palette-shape'));
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);

    // Path B: select a different object via the track label.
    act(() => {
      useSceneStore.getState().addObject({
        id: 'u1',
        type: 'unit',
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
        layerId: useSceneStore.getState().activeLayerId,
      });
    });
    fireEvent.click(screen.getByTestId('track-select-u1'));
    expect(useTimelineSelection.getState().selectedObjId).toBe('u1');
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
