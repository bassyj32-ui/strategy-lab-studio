// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Inspector } from './Inspector';
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

describe('Inspector', () => {
  beforeEach(reset);
  // DOM unmounting between tests is handled globally by src/test/setup.ts.

  it('shows a hint when nothing is selected', () => {
    render(<Inspector />);
    expect(screen.getByText(/No object selected/i)).toBeDefined();
  });

  it('edits a transform field and survives undo as one entry', () => {
    let id: string;
    act(() => {
      id = useSceneStore.getState().createObjectOfType('shape');
      useSceneStore.getState().setSelected(id);
    });
    render(<Inspector />);

    const xInput = screen.getByTestId('inspector-x') as HTMLInputElement;
    // focus starts the edit session (one undo entry)
    fireEvent.focus(xInput);
    fireEvent.change(xInput, { target: { value: '120' } });
    expect(useSceneStore.getState().scene.objects[id!].transform.x).toBe(120);

    // blur ends the edit session
    fireEvent.blur(xInput);

    // a single undo restores the pre-edit value
    act(() => useSceneStore.getState().undo());
    expect(useSceneStore.getState().scene.objects[id!].transform.x).toBe(0);
  });

  it('updates opacity from the numeric input', () => {
    let id: string;
    act(() => {
      id = useSceneStore.getState().createObjectOfType('marker');
      useSceneStore.getState().setSelected(id);
    });
    render(<Inspector />);
    const opacityInput = screen.getByTestId('inspector-opacity') as HTMLInputElement;
    fireEvent.focus(opacityInput);
    fireEvent.change(opacityInput, { target: { value: '0.25' } });
    expect(useSceneStore.getState().scene.objects[id!].transform.opacity).toBe(0.25);
    fireEvent.blur(opacityInput);
  });
});
