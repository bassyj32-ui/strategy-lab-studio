// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RightPanel } from './RightPanel';
import { useSceneStore } from '../scene/store';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';

const reset = () => {
  act(() => {
    useSceneStore.setState({
      scene: createDefaultScene(),
      past: [],
      future: [],
      selectedObjId: null,
      activeLayerId: DEFAULT_LAYER_ID,
    });
  });
};

describe('RightPanel', () => {
  beforeEach(reset);

  it('defaults to the Armies tab (the commander home base)', () => {
    render(<RightPanel />);
    expect(screen.getByTestId('tab-armies').getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(screen.getByTestId('armies-panel')).toBeTruthy();
  });

  it('switches to the Object tab (Inspector) and back to Armies', () => {
    render(<RightPanel />);
    fireEvent.click(screen.getByTestId('tab-object'));
    expect(screen.getByTestId('tab-object').getAttribute('aria-selected')).toBe(
      'true'
    );
    // Inspector renders (no selection hint), keyframe panel included.
    expect(screen.getByText(/No object selected/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId('tab-armies'));
    expect(screen.getByTestId('armies-tree')).toBeTruthy();
  });

  it('switches to the Shapes tab (replaces the retired AI tab)', () => {
    render(<RightPanel />);
    fireEvent.click(screen.getByTestId('tab-shapes'));
    expect(screen.getByTestId('shapes-panel')).toBeTruthy();
    // Old tabs are gone: properties became Object, AI tab is retired.
    expect(screen.queryByTestId('tab-properties')).toBeNull();
    expect(screen.queryByTestId('tab-assets')).toBeNull();
    expect(screen.queryByTestId('tab-ai')).toBeNull();
  });

  it('switches to the Layers tab (promoted from Armies disclosure)', () => {
    render(<RightPanel />);
    fireEvent.click(screen.getByTestId('tab-layers'));
    expect(screen.getByTestId('layer-add')).toBeTruthy();
  });
});
