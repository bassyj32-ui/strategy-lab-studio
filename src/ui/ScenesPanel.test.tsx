// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ScenesPanel } from './ScenesPanel';
import { useSceneStore } from '../scene/store';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';

const s = () => useSceneStore.getState();

const reset = () => {
  act(() => {
    useSceneStore.setState({
      scene: createDefaultScene(), // id 'scene-0'
      inactiveScenes: {},
      activeSceneId: 'scene-0',
      past: [],
      future: [],
      selectedObjId: null,
      activeLayerId: DEFAULT_LAYER_ID,
    });
  });
};

describe('ScenesPanel', () => {
  beforeEach(reset);

  it('lists every scene and marks the active one', () => {
    act(() => {
      useSceneStore.setState({
        inactiveScenes: { 'scene-1': createDefaultScene('scene-1') },
      });
    });
    render(<ScenesPanel />);
    // Active row carries the `layer active` class; both rows exist.
    const activeBtn = screen.getByTestId('scene-select-scene-0');
    expect(activeBtn.closest('li')?.classList.contains('active')).toBe(true);
    expect(activeBtn.textContent).toContain(s().scene.name);
    expect(screen.getByTestId('scene-select-scene-1')).toBeTruthy();
  });

  it('adds a scene via the UI and switches to it (old scene kept)', () => {
    render(<ScenesPanel />);
    fireEvent.change(screen.getByTestId('scene-name-input'), {
      target: { value: 'Second Battle' },
    });
    fireEvent.click(screen.getByTestId('scene-add'));

    expect(s().activeSceneId).not.toBe('scene-0');
    expect(s().scene.name).toBe('Second Battle');
    expect(Object.keys(s().inactiveScenes)).toEqual(['scene-0']);
    expect(Object.keys(s().inactiveScenes)).not.toContain(s().activeSceneId);
  });

  it('switches scenes via the UI without losing the outgoing scene', () => {
    act(() => {
      s().addScene('Other');
    });
    const added = s().activeSceneId;
    render(<ScenesPanel />);

    fireEvent.click(screen.getByTestId('scene-select-scene-0'));
    expect(s().activeSceneId).toBe('scene-0');
    expect(s().inactiveScenes[added]).toBeDefined();

    fireEvent.click(screen.getByTestId(`scene-select-${added}`));
    expect(s().activeSceneId).toBe(added);
  });

  it('duplicates the ACTIVE scene under fresh object/layer ids', () => {
    act(() => {
      s().createObjectOfType('shape'); // give the scene some content
    });
    const beforeIds = Object.keys(s().scene.objects);
    const beforeLayerIds = s().scene.layers.map((l) => l.id);
    render(<ScenesPanel />);

    fireEvent.click(screen.getByTestId(`scene-duplicate-${s().activeSceneId}`));

    const originalObjects = s().inactiveScenes['scene-0'].objects;
    expect(Object.keys(originalObjects)).toEqual(beforeIds); // source untouched
    // The copy is a DIFFERENT scene with remapped identities.
    expect(s().scene.name).toBe('Untitled Battle (copy)');
    for (const layer of s().scene.layers) {
      expect(beforeLayerIds).not.toContain(layer.id);
    }
    for (const [oldId, obj] of Object.entries(originalObjects)) {
      const copied = Object.values(s().scene.objects).find(
        (o) => o.type === obj.type
      );
      expect(copied).toBeDefined();
      expect(copied!.id).not.toBe(oldId);
    }
  });

  it('renames a scene via double-click inline editing', () => {
    render(<ScenesPanel />);
    fireEvent.doubleClick(screen.getByTestId('scene-select-scene-0'));
    const input = screen.getByTestId('scene-rename-scene-0');
    fireEvent.change(input, { target: { value: 'Cannae' } });
    fireEvent.blur(input);
    expect(s().scene.name).toBe('Cannae');
  });

  it('forbids deleting the last remaining scene (button disabled)', () => {
    render(<ScenesPanel />);
    const del = screen.getByTestId(
      `scene-delete-${s().activeSceneId}`
    ) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    fireEvent.click(del);
    expect(s().scene).toBeDefined(); // still exactly one scene
  });

  it('deletes an INACTIVE scene; deleting the ACTIVE one reassigns', () => {
    act(() => {
      s().addScene('Victim');
    });
    const victim = s().activeSceneId;
    render(<ScenesPanel />);

    // Inactive deletion just removes it.
    fireEvent.click(screen.getByTestId(`scene-delete-${victim}`));
    expect(s().inactiveScenes[victim]).toBeUndefined();

    // Active deletion falls back to a surviving scene.
    fireEvent.click(screen.getByTestId(`scene-delete-${s().activeSceneId}`));
    expect(s().activeSceneId).toBe('scene-0');
    expect(s().inactiveScenes).toEqual({});
  });

  it('multi-scene edits are UNDOABLE: undo restores the deleted + deactivates the copy', () => {
    render(<ScenesPanel />);
    fireEvent.click(screen.getByTestId('scene-add')); // created + switched
    const copy = s().activeSceneId;
    fireEvent.click(screen.getByTestId(`scene-delete-scene-0`)); // deleted original

    act(() => {
      s().undo(); // undoes the DELETION
    });
    expect(s().inactiveScenes['scene-0']).toBeDefined();
    expect(s().activeSceneId).toBe(copy);

    act(() => {
      s().undo(); // undoes the ADD (back to single original scene)
    });
    expect(s().activeSceneId).toBe('scene-0');
    expect(s().inactiveScenes[copy]).toBeUndefined();
    expect(Object.keys(s().inactiveScenes)).toHaveLength(0);
  });

  it('undo across scenes keeps each scene\'s OWN saved camera (PRD §87)', () => {
    render(<ScenesPanel />);
    // Scene A gets a distinctive saved camera.
    act(() => {
      s().updateCamera((cam) => ({ ...cam, zoom: 5 }));
    });
    act(() => {
      s().addScene('Other'); // switches to a scene with the DEFAULT camera
    });
    expect(s().scene.camera.zoom).not.toBe(5);

    act(() => {
      s().undo(); // undoes the add — back to scene A
    });
    expect(s().activeSceneId).toBe('scene-0');
    // A's SAVED camera must survive; the new scene's default view must not
    // have been injected into it.
    expect(s().scene.camera.zoom).toBe(5);
  });

  it('Save Project emits the versioned full-project JSON', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;

    act(() => {
      s().addScene('Extra');
    });
    render(<ScenesPanel />);
    fireEvent.click(screen.getByTestId('scene-save-project'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const args = createObjectURL.mock.calls[0] as unknown as [Blob];
    expect(args[0].type).toBe('application/json');
  });

  it('Load Project replaces the whole project from validated JSON — undoably', async () => {
    act(() => {
      s().addScene('Will be replaced');
    });
    const payload = JSON.stringify({
      schemaVersion: 1,
      activeSceneId: 'loaded-a',
      scenes: [
        { ...JSON.parse(JSON.stringify(createDefaultScene('loaded-a'))), name: 'Loaded' },
      ],
    });

    render(<ScenesPanel />);
    const input = screen.getByTestId('scene-load-input') as HTMLInputElement;
    const file = new File([payload], 'project.json', { type: 'application/json' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    // The read is async (FileReader fallback); wait for the store to settle.
    await waitFor(() => {
      expect(s().activeSceneId).toBe('loaded-a');
    });
    expect(s().scene.name).toBe('Loaded');
    expect(Object.keys(s().inactiveScenes)).toHaveLength(0);

    // LAW: load is undoable — the pre-load project comes back intact.
    act(() => {
      s().undo();
    });
    expect(s().scene.name).toBe('Will be replaced');
  });

  it('shows an error (and changes nothing) for invalid project JSON', async () => {
    render(<ScenesPanel />);
    const input = screen.getByTestId('scene-load-input') as HTMLInputElement;
    const file = new File(['{nope'], 'bad.json', { type: 'application/json' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    // The read is async (FileReader fallback); wait for the error to surface.
    await waitFor(() => {
      expect(screen.getByTestId('scene-error')).toBeTruthy();
    });
    // State untouched.
    expect(s().activeSceneId).toBe('scene-0');
    expect(s().inactiveScenes).toEqual({});
  });
});
