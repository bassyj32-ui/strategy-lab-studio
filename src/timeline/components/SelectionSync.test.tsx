// @vitest-environment jsdom
// Regression tests for UNIFIED SELECTION across components.
//
// Bugs covered:
//  - Bug 1 (successor): placement lives in the asset library; placing a unit
//    must select it everywhere (covered below + AssetsPanel tests). The old
//    Toolbar palette was removed — arrows are imported sprites now.
//  - Bug 2 (timeline side): clicking a KeyframeTrack label selected only for
//    the timeline; the Inspector/canvas did not follow.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { AssetsPanel } from '../../ui/AssetsPanel';
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
    // Path A: place a unit from the asset library (the placement flow).
    act(() => {
      useSceneStore.getState().registerAsset({
        id: 'a1',
        kind: 'sprite',
        name: 'cavalry',
        src: 'data:image/png;base64,xxxx',
        width: 16,
        height: 16,
        metadata: {
          aspectRatio: 1,
          defaultScale: 1,
          category: 'Cavalry',
          faction: 'red',
        },
      });
    });
    render(
      <>
        <AssetsPanel />
        <KeyframeTrack objId="u1" />
        <KeyframeEditor />
      </>
    );
    const addBtn = screen.getByRole('button', { name: /add keyframe at playhead/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true); // nothing selected yet

    fireEvent.click(screen.getByTestId('place-unit-a1'));
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    expect(useTimelineSelection.getState().selectedObjId).not.toBeNull();

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
