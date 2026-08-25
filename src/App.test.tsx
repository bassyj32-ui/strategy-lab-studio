// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, waitFor } from '@testing-library/react';

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
vi.mock('./ui/PreviewPanel', () => ({ PreviewPanel: () => <div /> }));

import App from './App';
import { useSceneStore } from './scene/store';
import { createDefaultScene } from './scene/factory';
import { saveAutosave, clearAutosave } from './persistence/autosave';

afterEach(cleanup);

describe('App persistence (reload data-loss regression)', () => {
  beforeEach(() => {
    act(() => {
      useSceneStore.setState({
        scene: createDefaultScene(),
        past: [],
        future: [],
      });
    });
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

    // Simulate relaunch: fresh store, same persisted blob.
    cleanup();
    act(() => {
      useSceneStore.setState({ scene: createDefaultScene(), past: [], future: [] });
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('restore-banner')).toBeDefined();
    });
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
