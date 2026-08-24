// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { AssetsPanel, isUnitAsset } from './AssetsPanel';
import { useSceneStore } from '../scene/store';
import { createDefaultScene } from '../scene/factory';

// The real import reads image dimensions via the DOM `Image` element, which is
// unavailable in jsdom. Mock the module so folder-import tests exercise the
// batching/undo path without real decoding (REV-PASS FIX #2b).
vi.mock('../assets/import', () => ({
  importAssetFromFile: vi.fn(),
}));

import { importAssetFromFile } from '../assets/import';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockImport = importAssetFromFile as any;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const seedAsset = {
  id: 'flag-1',
  kind: 'image' as const,
  name: 'flag',
  src: 'data:image/png;base64,xxxx',
  width: 16,
  height: 16,
};

/** A unit-category sprite asset (should drop / place as a UNIT). */
const unitAsset = {
  id: 'u1',
  kind: 'sprite' as const,
  name: 'cavalry',
  src: 'data:image/png;base64,yyyy',
  width: 32,
  height: 32,
  metadata: {
    aspectRatio: 1,
    defaultScale: 1,
    category: 'Infantry' as const,
    faction: 'red' as const,
  },
};

/** A markers asset (should drop / place as a MARKER). */
const markerAsset = {
  id: 'm1',
  kind: 'image' as const,
  name: 'waypoint',
  src: 'data:image/png;base64,zzzz',
  width: 16,
  height: 16,
  metadata: { aspectRatio: 1, defaultScale: 1, category: 'Markers' as const },
};

class MockDataTransfer {
  store: Record<string, string> = {};
  dropEffect = '';
  effectAllowed = '';
  setData(key: string, value: string) {
    this.store[key] = value;
  }
  getData(key: string) {
    return this.store[key] ?? '';
  }
}

beforeEach(() => {
  mockImport.mockReset();
  act(() => {
    useSceneStore.setState({ scene: createDefaultScene(), past: [], future: [] });
  });
});

describe('AssetsPanel', () => {
  it('shows an empty hint when there are no assets', () => {
    render(<AssetsPanel />);
    expect(screen.getByTestId('assets-panel')).toBeTruthy();
    expect(screen.getByText(/No assets yet/)).toBeTruthy();
  });

  it('lists a registered asset', () => {
    act(() => {
      useSceneStore.getState().registerAsset(seedAsset);
    });
    render(<AssetsPanel />);
    expect(screen.getByTestId('asset-flag-1')).toBeTruthy();
    expect(screen.getByText('flag')).toBeTruthy();
  });

  it('delete is enabled for an unreferenced asset and removes it', () => {
    act(() => {
      useSceneStore.getState().registerAsset(seedAsset);
    });
    render(<AssetsPanel />);
    const del = screen.getByTestId('delete-asset-flag-1') as HTMLButtonElement;
    expect(del.disabled).toBe(false);
    fireEvent.click(del);
    expect(useSceneStore.getState().scene.assets['flag-1']).toBeUndefined();
  });

  it('delete is disabled while an object references the asset', () => {
    act(() => {
      useSceneStore.getState().registerAsset(seedAsset);
      useSceneStore.getState().createObjectOfType('marker', { assetId: 'flag-1' });
    });
    render(<AssetsPanel />);
    const del = screen.getByTestId('delete-asset-flag-1') as HTMLButtonElement;
    expect(del.disabled).toBe(true);
  });

  describe('isUnitAsset', () => {
    it('true for unit-category assets, false for markers / no category', () => {
      expect(isUnitAsset(unitAsset)).toBe(true);
      expect(isUnitAsset(markerAsset)).toBe(false);
      // An asset with metadata but no category is NOT a unit.
      expect(
        isUnitAsset({ metadata: { aspectRatio: 1, defaultScale: 1 } })
      ).toBe(false);
    });
  });

  describe('"Place as unit" button', () => {
    it('places a unit object referencing the asset + faction on the active layer and selects it', () => {
      act(() => {
        useSceneStore.getState().registerAsset(unitAsset);
      });
      render(<AssetsPanel />);
      const btn = screen.getByTestId('place-unit-u1') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      fireEvent.click(btn);

      const scene = useSceneStore.getState().scene;
      const created = Object.values(scene.objects).find(
        (o) => o.assetId === 'u1'
      );
      expect(created).toBeTruthy();
      expect(created!.type).toBe('unit');
      expect(created!.assetId).toBe('u1');
      expect(created!.faction).toBe('red');
      // On the active (default) layer.
      expect(created!.layerId).toBe(scene.layers[0].id);
      // Selected in BOTH stores (unified selection).
      expect(useSceneStore.getState().selectedObjId).toBe(created!.id);
    });

    it('is present on every asset card', () => {
      act(() => {
        useSceneStore.getState().registerAssets([unitAsset, markerAsset]);
      });
      render(<AssetsPanel />);
      expect(screen.getByTestId('place-unit-u1')).toBeTruthy();
      expect(screen.getByTestId('place-unit-m1')).toBeTruthy();
    });
  });

  describe('dragstart payload', () => {
    it('sets text/plain to "unit" for a unit-category asset', () => {
      act(() => {
        useSceneStore.getState().registerAsset(unitAsset);
      });
      render(<AssetsPanel />);
      const card = screen.getByTestId('asset-u1');
      const dt = new MockDataTransfer();
      fireEvent.dragStart(card, { dataTransfer: dt as unknown as DataTransfer });
      expect(dt.getData('application/x-asset-id')).toBe('u1');
      expect(dt.getData('text/plain')).toBe('unit');
    });

    it('sets text/plain to "marker" for a Markers asset', () => {
      act(() => {
        useSceneStore.getState().registerAsset(markerAsset);
      });
      render(<AssetsPanel />);
      const card = screen.getByTestId('asset-m1');
      const dt = new MockDataTransfer();
      fireEvent.dragStart(card, { dataTransfer: dt as unknown as DataTransfer });
      expect(dt.getData('application/x-asset-id')).toBe('m1');
      expect(dt.getData('text/plain')).toBe('marker');
    });
  });

  describe('folder import (REV-PASS FIX #2b)', () => {
    const flush = () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

    /** Drive the hidden folder <input> change with a list of fake Files. */
    async function pickFolder(files: File[]) {
      render(<AssetsPanel />);
      const input = screen.getByTestId('import-folder') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files } });
        await new Promise((r) => setTimeout(r, 0));
      });
    }

    it('registers ALL valid files in ONE batch (single undo entry)', async () => {
      const spy = vi.spyOn(useSceneStore.getState(), 'registerAssets');
      mockImport.mockImplementation(async (file: File) => ({
        id: `asset-${file.name}`,
        kind: 'sprite',
        name: file.name,
        src: 'data:image/png;base64,xxx',
        width: 10,
        height: 10,
        metadata: { aspectRatio: 1, defaultScale: 1 },
      }));

      await pickFolder([
        new File([''], 'red-cavalry.png', { type: 'image/png' }),
        new File([''], 'blue-infantry.png', { type: 'image/png' }),
      ]);
      await flush();

      // Every file was attempted, but the batch collapsed to ONE registerAssets.
      expect(mockImport).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledTimes(1);
      const registered = spy.mock.calls[0][0] as Array<{ id: string }>;
      expect(registered).toHaveLength(2);
      expect(registered.map((a) => a.id)).toEqual([
        'asset-red-cavalry.png',
        'asset-blue-infantry.png',
      ]);
    });

    it('one bad file: still registers the good asset (single batch) + warns once', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const spy = vi.spyOn(useSceneStore.getState(), 'registerAssets');
      mockImport.mockImplementation(async (file: File) => {
        if (file.name.includes('bad')) {
          throw new Error('not an image');
        }
        return {
          id: `asset-${file.name}`,
          kind: 'sprite',
          name: file.name,
          src: 'data:image/png;base64,xxx',
          width: 10,
          height: 10,
          metadata: { aspectRatio: 1, defaultScale: 1 },
        };
      });

      await pickFolder([
        new File([''], 'good.png', { type: 'image/png' }),
        new File([''], 'bad.txt', { type: 'text/plain' }),
      ]);
      await flush();

      // All files attempted despite one failing.
      expect(mockImport).toHaveBeenCalledTimes(2);
      // The good asset is registered, in ONE batch.
      expect(spy).toHaveBeenCalledTimes(1);
      const registered = spy.mock.calls[0][0] as Array<{ id: string }>;
      expect(registered).toHaveLength(1);
      expect(registered[0].id).toBe('asset-good.png');
      // A single consolidated warning named the skipped file.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('bad.txt');
    });
  });
});

