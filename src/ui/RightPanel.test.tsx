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

  it('defaults to the Properties tab (Inspector visible)', () => {
    render(<RightPanel />);
    expect(screen.getByTestId('tab-properties').getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(screen.getByText(/No object selected/i)).toBeTruthy();
  });

  it('switches to Layers and back', () => {
    render(<RightPanel />);
    fireEvent.click(screen.getByTestId('tab-layers'));
    // The layers panel renders its layer list.
    expect(screen.getByTestId('tab-layers').getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(screen.queryByText(/No object selected/i)).toBeNull();
    fireEvent.click(screen.getByTestId('tab-properties'));
    expect(screen.getByText(/No object selected/i)).toBeTruthy();
  });

  it('switches to the Assets tab', () => {
    render(<RightPanel />);
    fireEvent.click(screen.getByTestId('tab-assets'));
    expect(screen.getByTestId('assets-panel')).toBeTruthy();
  });
});
