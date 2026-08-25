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
  it('BUG 1 successor: palette arrow click ARMS the draw tool (placement now lives in the asset library and is covered by AssetsPanel tests)', () => {
    render(<Toolbar />);
    const arrow = screen.getByTestId('palette-arrow');
    fireEvent.click(arrow);
    expect(useSceneStore.getState().activeTool).toBe('arrow');
    expect(arrow.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(arrow);
    expect(useSceneStore.getState().activeTool).toBe('select');
  });

  it('keyboard activation (Enter) toggles the arrow tool too', () => {
    render(<Toolbar />);
    const item = screen.getByTestId('palette-arrow');
    fireEvent.keyDown(item, { key: 'Enter' });
    expect(useSceneStore.getState().activeTool).toBe('arrow');
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
