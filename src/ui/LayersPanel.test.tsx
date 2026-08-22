// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LayersPanel } from './LayersPanel';
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

describe('LayersPanel', () => {
  beforeEach(reset);
  // DOM unmounting between tests is handled globally by src/test/setup.ts.

  it('adds a layer via the UI', () => {
    render(<LayersPanel />);
    const before = useSceneStore.getState().scene.layers.length;
    fireEvent.change(screen.getByTestId('layer-name-input'), {
      target: { value: 'UI Layer' },
    });
    fireEvent.click(screen.getByTestId('layer-add'));
    expect(useSceneStore.getState().scene.layers.length).toBe(before + 1);
    expect(
      useSceneStore.getState().scene.layers.some((l) => l.name === 'UI Layer')
    ).toBe(true);
  });

  it('toggles layer visibility via the UI', () => {
    render(<LayersPanel />);
    fireEvent.click(screen.getByTestId(`layer-toggle-${DEFAULT_LAYER_ID}`));
    expect(
      useSceneStore.getState().scene.layers.find((l) => l.id === DEFAULT_LAYER_ID)!
        .visible
    ).toBe(false);
  });

  it('sets the active layer via the UI', () => {
    render(<LayersPanel />);
    fireEvent.click(screen.getByTestId(`layer-select-${DEFAULT_LAYER_ID}`));
    expect(useSceneStore.getState().activeLayerId).toBe(DEFAULT_LAYER_ID);
  });

  it('forbids deleting the last remaining layer', () => {
    render(<LayersPanel />);
    const del = screen.getByTestId(
      `layer-delete-${DEFAULT_LAYER_ID}`
    ) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    fireEvent.click(del);
    expect(useSceneStore.getState().scene.layers.length).toBe(1);
  });
});
