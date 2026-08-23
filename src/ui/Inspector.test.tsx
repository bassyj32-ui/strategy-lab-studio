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

  it('shows Length + Color fields only for arrows', () => {
    let arrowId: string;
    let shapeId: string;
    act(() => {
      shapeId = useSceneStore.getState().createObjectOfType('shape');
      arrowId = useSceneStore.getState().createObjectOfType('arrow');
      useSceneStore.getState().setSelected(shapeId);
    });
    render(<Inspector />);
    expect(screen.queryByTestId('inspector-length')).toBeNull();
    expect(screen.queryByTestId('inspector-color')).toBeNull();

    act(() => useSceneStore.getState().setSelected(arrowId));
    expect(screen.getByTestId('inspector-length')).toBeDefined();
    expect(
      (screen.getByTestId('inspector-color') as HTMLInputElement).value
    ).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('edits arrow length as one undoable session', () => {
    let id: string;
    act(() => {
      id = useSceneStore.getState().createObjectOfType('arrow');
      useSceneStore.getState().setSelected(id);
    });
    render(<Inspector />);
    const lenInput = screen.getByTestId('inspector-length') as HTMLInputElement;
    fireEvent.focus(lenInput);
    fireEvent.change(lenInput, { target: { value: '300' } });
    expect(useSceneStore.getState().scene.objects[id!].length).toBe(300);
    fireEvent.blur(lenInput);

    act(() => useSceneStore.getState().undo());
    // Undo restores the factory default length.
    expect(useSceneStore.getState().scene.objects[id!].length).toBe(120);
  });

  it('edits arrow color via the color input', () => {
    let id: string;
    act(() => {
      id = useSceneStore.getState().createObjectOfType('arrow');
      useSceneStore.getState().setSelected(id);
    });
    render(<Inspector />);
    const colorInput = screen.getByTestId('inspector-color') as HTMLInputElement;
    fireEvent.focus(colorInput);
    fireEvent.change(colorInput, { target: { value: '#00ff88' } });
    expect(useSceneStore.getState().scene.objects[id!].color).toBe('#00ff88');
    fireEvent.blur(colorInput);
  });
});
