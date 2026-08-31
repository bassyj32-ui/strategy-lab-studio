// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Inspector } from './Inspector';
import { useSceneStore } from '../scene/store';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';
import { usePlaybackStore } from '../timeline/playbackStore';

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

  it('rotation preset chips set the rotation as ONE undo step', () => {
    let id: string;
    act(() => {
      id = useSceneStore.getState().createObjectOfType('shape');
      useSceneStore.getState().setSelected(id);
    });
    render(<Inspector />);
    fireEvent.click(screen.getByTestId('preset-rot-90'));
    expect(useSceneStore.getState().scene.objects[id!].transform.rotation).toBe(90);
    fireEvent.click(screen.getByTestId('preset-rot--45'));
    expect(useSceneStore.getState().scene.objects[id!].transform.rotation).toBe(-45);
    // Two chips → exactly two undo steps.
    act(() => useSceneStore.getState().undo());
    expect(useSceneStore.getState().scene.objects[id!].transform.rotation).toBe(90);
  });

  it('opacity preset chips write fractions and the reset chip zeroes rotation', () => {
    let id: string;
    act(() => {
      id = useSceneStore.getState().createObjectOfType('shape');
      useSceneStore.getState().setSelected(id);
    });
    render(<Inspector />);
    fireEvent.click(screen.getByTestId('preset-op-25'));
    expect(useSceneStore.getState().scene.objects[id!].transform.opacity).toBe(0.25);
    fireEvent.click(screen.getByTestId('preset-op-100'));
    expect(useSceneStore.getState().scene.objects[id!].transform.opacity).toBe(1);
    act(() => {
      useSceneStore
        .getState()
        .updateTransform(id!, { rotation: 30 });
    });
    fireEvent.click(screen.getByTestId('preset-rot-0'));
    expect(useSceneStore.getState().scene.objects[id!].transform.rotation).toBe(0);
  });
});

describe('Inspector keyframe panel (Object tab, keyframes first)', () => {
  beforeEach(() => {
    act(() => {
      useSceneStore.setState({
        scene: createDefaultScene(),
        past: [],
        future: [],
        selectedObjId: null,
        activeLayerId: DEFAULT_LAYER_ID,
      });
      useSceneStore.getState().setAutoKeyframe(false);
      usePlaybackStore.setState({ currentTime: 0, isPlaying: false, duration: 10 });
    });
  });

  const seedTwoKeyframes = () => {
    let id: string;
    act(() => {
      id = useSceneStore.getState().createObjectOfType('shape');
      useSceneStore.getState().setSelected(id!);
      useSceneStore.getState().setKeyframeAtTime(id!, 0);
      usePlaybackStore.setState({ currentTime: 2 });
      useSceneStore.getState().updateTransform(id!, { x: 300 });
      useSceneStore.getState().setKeyframeAtTime(id!, 2);
      usePlaybackStore.setState({ currentTime: 0 });
    });
    return id!;
  };

  it('lists every keyframe with time / jump / easing / remove controls', () => {
    const id = seedTwoKeyframes();
    render(<Inspector />);
    expect(screen.getByTestId('inspector-keyframes')).toBeTruthy();
    expect((screen.getByTestId(`kf-time-${id}-0`) as HTMLInputElement).value).toBe('0.00');
    expect((screen.getByTestId(`kf-time-${id}-2`) as HTMLInputElement).value).toBe('2.00');

    // Jump seeks the playhead AND highlights the timeline diamond.
    fireEvent.click(screen.getByTestId('kf-jump-1'));
    expect(usePlaybackStore.getState().currentTime).toBe(2);

    // Easing persists on the LEFT keyframe of the segment.
    fireEvent.change(screen.getByTestId('kf-easing-0'), {
      target: { value: 'easeIn' },
    });
    const kfs = useSceneStore.getState().scene.keyframes[id];
    expect(kfs.find((k) => k.time === 0)?.easing).toBe('easeIn');

    // Remove drops exactly one keyframe.
    fireEvent.click(screen.getByTestId('kf-remove-1'));
    expect(useSceneStore.getState().scene.keyframes[id]).toHaveLength(1);
  });

  it('+ Add at playhead and the Auto-KF mirror drive the same stores', () => {
    seedTwoKeyframes();
    render(<Inspector />);
    // Auto-KF checkbox mirrors the editor pref.
    fireEvent.click(screen.getByTestId('inspector-auto-kf'));
    expect(useSceneStore.getState().autoKeyframe).toBe(true);

    // Add-at-playhead writes a keyframe at the current time.
    act(() => usePlaybackStore.setState({ currentTime: 1 }));
    fireEvent.click(screen.getByTestId('inspector-kf-add'));
    const [only] = Object.values(useSceneStore.getState().scene.objects);
    const times = useSceneStore.getState().scene.keyframes[only.id].map((k) => k.time);
    expect(times).toContain(1);
  });
});
