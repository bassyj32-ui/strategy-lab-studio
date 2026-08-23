// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { CameraTrack } from './CameraTrack';
import { usePlaybackStore } from '../playbackStore';
import { useSceneStore } from '../../scene/store';
import { createDefaultScene } from '../../scene/factory';

afterEach(cleanup);

beforeEach(() => {
  act(() => {
    usePlaybackStore.setState({
      currentTime: 0,
      isPlaying: false,
      loop: false,
      snapToFrame: false,
      duration: 10,
      fps: 10,
    });
    useSceneStore.setState({ scene: createDefaultScene(), past: [], future: [] });
  });
});

describe('CameraTrack', () => {
  it('renders nothing while the scene has no camera keyframes', () => {
    const { container } = render(<CameraTrack />);
    expect(container.querySelector('[data-testid="camera-track"]')).toBeNull();
  });

  it('keys the live view at the playhead and shows a diamond', () => {
    act(() => {
      useSceneStore.getState().updateCamera((cam) => ({ ...cam, x: 250 }));
      useSceneStore.getState().setCameraKeyframe(2);
    });
    render(<CameraTrack />);
    expect(screen.getByTestId('camera-track')).toBeTruthy();
    expect(screen.getByTestId('camera-kf-2')).toBeTruthy();
  });

  it('remove button is enabled only with a key at the playhead and removes it', () => {
    act(() => {
      useSceneStore.getState().updateCamera((cam) => ({ ...cam, y: 77 }));
      useSceneStore.getState().setCameraKeyframe(2);
    });
    render(<CameraTrack />);
    const remove = screen.getByTestId('camera-remove-at-playhead') as HTMLButtonElement;
    expect(remove.disabled).toBe(true); // playhead is at t=0
    act(() => {
      usePlaybackStore.getState().seek(2);
    });
    expect(
      (screen.getByTestId('camera-remove-at-playhead') as HTMLButtonElement)
        .disabled
    ).toBe(false);
    fireEvent.click(screen.getByTestId('camera-remove-at-playhead'));
    // Track emptied -> row unmounts entirely.
    expect(document.querySelector('[data-testid="camera-track"]')).toBeNull();
    // One undo step restores it.
    act(() => {
      useSceneStore.getState().undo();
    });
    expect(useSceneStore.getState().scene.cameraTrack).toHaveLength(1);
  });

  it('clicking a diamond seeks the playhead to its time', () => {
    act(() => {
      useSceneStore.getState().setCameraKeyframe(4);
    });
    render(<CameraTrack />);
    fireEvent.click(screen.getByTestId('camera-kf-4'));
    expect(usePlaybackStore.getState().currentTime).toBe(4);
  });
});
