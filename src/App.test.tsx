// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, waitFor, fireEvent, within } from '@testing-library/react';

// Regression harness for the reload data-loss bug: the autosave must behave
// like persistent session state. We swap IndexedDB for a memory map and spy
// on clearAutosave so we can assert the unload path NEVER wipes the blob.
vi.mock('./persistence/autosave', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./persistence/autosave')>();
  const mem = new Map<string, string>();
  const key = actual.AUTOSAVE_KEY;
  return {
    ...actual,
    saveAutosave: vi.fn((project: unknown) => {
      mem.set(key, JSON.stringify({ project, savedAt: 1234 }));
      return Promise.resolve();
    }),
    loadAutosave: vi.fn(() => {
      const raw = mem.get(key);
      if (!raw) return Promise.resolve(null);
      const env = JSON.parse(raw) as { project: unknown; savedAt: number };
      return Promise.resolve({
        project: env.project as never,
        savedAt: env.savedAt,
      });
    }),
    clearAutosave: vi.fn(() => {
      mem.delete(key);
      return Promise.resolve();
    }),
    __mem: mem,
  };
});

// Full <App /> would pull konva (needs the native `canvas` package under
// vitest's node/jsdom split) and the Remotion Player needs a real canvas 2D
// context. Persistence is what's under test here.
vi.mock('./canvas/CanvasStage', () => ({ CanvasStage: () => <div /> }));
vi.mock('./ui/PreviewPanel', () => ({
  PreviewPanel: () => <div data-testid="preview-player-stub" />,
}));

import App from './App';
import { useSceneStore } from './scene/store';
import { usePlaybackStore } from './timeline/playbackStore';
import { createDefaultScene } from './scene/factory';
import { saveAutosave, clearAutosave } from './persistence/autosave';

afterEach(cleanup);

describe('App persistence (reload data-loss regression)', () => {
  beforeEach(() => {
    // Mock fns keep call history across tests — start each test clean.
    vi.mocked(saveAutosave).mockClear();
    vi.mocked(clearAutosave).mockClear();
    act(() => {
      useSceneStore.setState({
        scene: createDefaultScene(),
        past: [],
        future: [],
      });
    });
  });

  it('AUTO-RESTORES the autosave at boot — no click needed', async () => {
    // Seed a previous session's work.
    act(() => {
      const st = useSceneStore.getState();
      st.renameScene(st.activeSceneId, 'Cannae');
    });
    await act(async () => {
      await saveAutosave(useSceneStore.getState().getProject());
    });

    // Simulate relaunch: fresh default scene in memory, same persisted blob.
    cleanup();
    act(() => {
      useSceneStore.setState({ scene: createDefaultScene(), past: [], future: [] });
    });
    render(<App />);

    // The saved project is loaded straight into the store…
    await waitFor(() => {
      expect(useSceneStore.getState().scene.name).toBe('Cannae');
    });
    // …and only a small "Start fresh" toast confirms it (no blocking banner).
    // Own waitFor: the zustand store commit and the React toast state can
    // land in separate renders under load.
    await waitFor(() => {
      expect(screen.getByTestId('session-toast')).toBeTruthy();
    });
  });

  it('"Start fresh" wipes the autosave and resets to a clean default scene', async () => {
    act(() => {
      const st = useSceneStore.getState();
      st.renameScene(st.activeSceneId, 'Trebia');
    });
    await act(async () => {
      await saveAutosave(useSceneStore.getState().getProject());
    });
    cleanup();
    act(() => {
      useSceneStore.setState({ scene: createDefaultScene(), past: [], future: [] });
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('session-toast')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('session-toast-fresh'));
    expect(clearAutosave).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('session-toast')).toBeNull();
    });
    expect(useSceneStore.getState().scene.name).toBe(createDefaultScene().name);
    expect(useSceneStore.getState().inactiveScenes).toEqual({});
    expect(useSceneStore.getState().past).toHaveLength(0);
  });

  it('flushes the debounced autosave when the tab goes hidden (zero-loss window)', async () => {
    render(<App />);
    act(() => {
      useSceneStore.getState().renameScene(useSceneStore.getState().activeSceneId, 'Zama');
    });
    expect(saveAutosave).not.toHaveBeenCalled(); // still inside debounce window

    const doc = document as Document & { hidden: boolean };
    const prevHidden = Object.getOwnPropertyDescriptor(doc, 'hidden');
    Object.defineProperty(doc, 'hidden', { value: true, configurable: true });
    fireEvent(document, new Event('visibilitychange'));
    Object.defineProperty(doc, 'hidden', prevHidden ?? { value: false, configurable: true });

    expect(saveAutosave).toHaveBeenCalledTimes(1);
  });

  it('does NOT clear the autosave when the user closes/reloads with unsaved work', async () => {
    render(<App />);
    // Real edit → undo history non-empty (exactly the reported repro).
    act(() => {
      const st = useSceneStore.getState();
      st.renameScene(st.activeSceneId, 'Cannae');
    });
    expect(useSceneStore.getState().past.length).toBeGreaterThan(0);
    await act(async () => {
      await saveAutosave(useSceneStore.getState().getProject());
    });

    window.dispatchEvent(new Event('beforeunload'));

    expect(clearAutosave).not.toHaveBeenCalled();
  });

  it('still warns before losing unsaved work (beforeunload prompt)', () => {
    render(<App />);
    act(() => {
      const st = useSceneStore.getState();
      st.renameScene(st.activeSceneId, 'Trebia');
    });
    const evt = new Event('beforeunload');
    evt.preventDefault = vi.fn();
    Object.defineProperty(evt, 'returnValue', { value: '', writable: true });
    window.dispatchEvent(evt);
    expect(evt.preventDefault).toHaveBeenCalled();
  });
});

describe('App big-screen preview expand', () => {
  beforeEach(() => {
    act(() => {
      useSceneStore.setState({
        scene: createDefaultScene(),
        past: [],
        future: [],
      });
    });
  });

  it('expand moves the player into a fullscreen overlay; Esc returns it', () => {
    render(<App />);
    expect(screen.queryByTestId('preview-overlay')).toBeNull();

    fireEvent.click(screen.getByTestId('preview-expand'));
    // Overlay holds the (single) player instance; the dock shows a placeholder.
    expect(screen.getByTestId('preview-overlay')).toBeTruthy();
    expect(screen.getByTestId('preview-dock-placeholder')).toBeTruthy();
    expect(
      document.querySelectorAll('[data-testid="preview-player-stub"]')
    ).toHaveLength(1); // moved, never duplicated

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('preview-overlay')).toBeNull();
    expect(screen.queryByTestId('preview-dock-placeholder')).toBeNull();
  });

  it('✕ button and backdrop click also close the overlay', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('preview-expand'));
    fireEvent.click(screen.getByTestId('preview-collapse'));
    expect(screen.queryByTestId('preview-overlay')).toBeNull();

    fireEvent.click(screen.getByTestId('preview-expand'));
    fireEvent.click(screen.getByTestId('preview-overlay')); // backdrop
    expect(screen.queryByTestId('preview-overlay')).toBeNull();
  });

  it('overlay mounts transport controls; Play/Pause + Spacebar drive the one clock', () => {
    render(<App />);
    // The timeline footer already has one transport bar; the overlay adds its
    // own (same playback store, one clock) since it covers the footer.
    expect(document.querySelectorAll('[data-testid="transport-controls"]')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('preview-expand'));
    const overlay = screen.getByTestId('preview-overlay');
    expect(
      document.querySelectorAll('[data-testid="transport-controls"]')
    ).toHaveLength(2);
    const bar = within(overlay).getByTestId('transport-controls');

    const play = within(bar).getByRole('button', { name: 'Play' });
    fireEvent.click(play);
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    const pause = within(bar).getByRole('button', { name: 'Pause' });
    fireEvent.click(pause);
    expect(usePlaybackStore.getState().isPlaying).toBe(false);

    // Spacebar = play/pause (CapCut muscle memory), scoped to the overlay.
    fireEvent.keyDown(window, { key: ' ' });
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    fireEvent.keyDown(window, { key: ' ' });
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });
});
