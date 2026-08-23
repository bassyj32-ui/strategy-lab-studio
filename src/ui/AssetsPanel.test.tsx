// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { AssetsPanel } from './AssetsPanel';
import { useSceneStore } from '../scene/store';
import { createDefaultScene } from '../scene/factory';

afterEach(cleanup);

const seedAsset = {
  id: 'flag-1',
  kind: 'image' as const,
  name: 'flag',
  src: 'data:image/png;base64,xxxx',
  width: 16,
  height: 16,
};

beforeEach(() => {
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
});
