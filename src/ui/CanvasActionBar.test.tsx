// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { CanvasActionBar } from './CanvasActionBar';
import { useSceneStore } from '../scene/store';
import { createDefaultScene } from '../scene/factory';

// The toolbar background remover drives the real store action, which reads the
// image onto a canvas — unavailable in jsdom. Mock only the pixel pipeline.
vi.mock('../assets/import', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../assets/import')>();
  return {
    ...actual,
    importAssetFromFile: vi.fn(),
    importMapAsset: vi.fn(),
    removeBackgroundFromAssetSrc: vi.fn(),
  };
});

import { removeBackgroundFromAssetSrc } from '../assets/import';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRemoveBg = removeBackgroundFromAssetSrc as any;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  act(() => {
    useSceneStore.setState({
      scene: createDefaultScene(),
      past: [],
      future: [],
      selectedObjId: null,
      selectedIds: [],
    });
  });
});

describe('CanvasActionBar (relocated Toolbar actions)', () => {
  it('renders map/save/export, group/ungroup, path tool and the formation builder', () => {
    render(<CanvasActionBar />);
    for (const id of [
      'import-map',
      'save-scene',
      'export-video',
      'group',
      'ungroup',
      'path-tool',
      'formation-pattern',
      'formation-spacing',
      'formation-unit-count',
      'create-formation',
      'remove-bg-btn',
      'battle-fx-btn',
      'toolbar-status',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it('path-tool button toggles activeTool between path and select', () => {
    render(<CanvasActionBar />);
    const btn = screen.getByTestId('path-tool');
    expect(btn.textContent).toBe('Draw Path');
    expect(useSceneStore.getState().activeTool).toBe('select');

    fireEvent.click(btn);
    expect(useSceneStore.getState().activeTool).toBe('path');
    expect(btn.textContent).toBe('✓ Path');

    fireEvent.click(btn);
    expect(useSceneStore.getState().activeTool).toBe('select');
    expect(btn.textContent).toBe('Draw Path');
  });

  it('group/ungroup gate on selection; grouping selects the new parent', () => {
    const s = useSceneStore.getState();
    act(() => {
      s.addObject({
        id: 'a',
        type: 'unit',
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
        layerId: s.activeLayerId,
      });
      s.addObject({
        id: 'b',
        type: 'unit',
        transform: { x: 40, y: 0, rotation: 0, scale: 1, opacity: 1 },
        layerId: s.activeLayerId,
      });
    });

    const { rerender } = render(<CanvasActionBar />);
    expect(
      (screen.getByTestId('group') as HTMLButtonElement).disabled
    ).toBe(true); // single selection

    act(() => {
      useSceneStore.setState({ selectedIds: ['a', 'b'] });
    });
    rerender(<CanvasActionBar />);
    expect(
      (screen.getByTestId('group') as HTMLButtonElement).disabled
    ).toBe(false);

    fireEvent.click(screen.getByTestId('group'));
    const st = useSceneStore.getState();
    // groupObject nests one candidate under the other (no synthetic node).
    const parent = st.scene.objects[st.selectedObjId!];
    expect(parent?.type).toBe('unit');
    const childId = parent.id === 'a' ? 'b' : 'a';
    expect(st.scene.objects[childId].parentId).toBe(parent.id);
    expect(screen.getByTestId('toolbar-status').textContent).toContain('Grouped');
  });

  it('Arrange Selected Units button is disabled when fewer than 2 units selected', () => {
    render(<CanvasActionBar />);
    const btn = screen.getByTestId('create-formation') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Arrange Selected Units');
    expect(screen.getByTestId('formation-unit-count').textContent).toBe('Selected Units: 0');
  });

  it('Arrange Selected Units button enables when 2+ units are selected and arranges them', () => {
    const st = useSceneStore.getState();
    act(() => {
      st.addObject({
        id: 'u1',
        type: 'unit',
        transform: { x: 100, y: 100, rotation: 0, scale: 1, opacity: 1 },
        layerId: st.activeLayerId,
      });
      st.addObject({
        id: 'u2',
        type: 'unit',
        transform: { x: 200, y: 100, rotation: 0, scale: 1, opacity: 1 },
        layerId: st.activeLayerId,
      });
      st.addObject({
        id: 'u3',
        type: 'unit',
        transform: { x: 150, y: 200, rotation: 0, scale: 1, opacity: 1 },
        layerId: st.activeLayerId,
      });
    });

    const { rerender } = render(<CanvasActionBar />);
    const btn = screen.getByTestId('create-formation') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    act(() => {
      useSceneStore.setState({ selectedIds: ['u1', 'u2', 'u3'] });
    });
    rerender(<CanvasActionBar />);
    expect(btn.disabled).toBe(false);
    expect(screen.getByTestId('formation-unit-count').textContent).toBe('Selected Units: 3');

    fireEvent.click(btn);
    const st2 = useSceneStore.getState();
    // A group should have been created and selected.
    expect(st2.selectedObjId).not.toBeNull();
    const group = st2.scene.objects[st2.selectedObjId!];
    expect(group?.type).toBe('group');
    expect(group?.formation?.pattern).toBe('line');
    // All three units should be reparented under the group.
    const children = Object.values(st2.scene.objects).filter(
      (o) => o.parentId === group.id,
    );
    expect(children).toHaveLength(3);
    expect(screen.getByTestId('toolbar-status').textContent).toContain(
      'Arranged units into line formation',
    );
  });

  describe('background remover (toolbar control)', () => {
    const seedAsset = {
      id: 'flag-1',
      kind: 'image' as const,
      name: 'flag',
      src: 'data:image/png;base64,xxxx',
      width: 16,
      height: 16,
    };
    const mapAsset = {
      id: 'map-1',
      kind: 'map' as const,
      name: 'terrain',
      src: 'data:image/png;base64,mmmm',
      width: 64,
      height: 64,
    };

    const targetFlag = () => {
      act(() => {
        useSceneStore.getState().registerAsset(seedAsset);
        useSceneStore.setState({ bgTargetAssetId: 'flag-1' });
      });
    };

    it('Remove BG is disabled until a non-map asset card is targeted', () => {
      render(<CanvasActionBar />);
      const btn = screen.getByTestId('remove-bg-btn') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);

      // A MAP target keeps it disabled (boss: not on map assets).
      act(() => {
        useSceneStore.getState().registerAsset(mapAsset);
        useSceneStore.setState({ bgTargetAssetId: 'map-1' });
      });
      expect(btn.disabled).toBe(true);
    });

    it('enables once a non-map asset card is targeted', () => {
      targetFlag();
      render(<CanvasActionBar />);
      expect(
        (screen.getByTestId('remove-bg-btn') as HTMLButtonElement).disabled
      ).toBe(false);
    });

    it('opens the color-key picker with presets, custom color and tolerance', () => {
      targetFlag();
      render(<CanvasActionBar />);
      fireEvent.click(screen.getByTestId('remove-bg-btn'));

      expect(screen.getByTestId('bg-remover')).toBeTruthy();
      expect(screen.getByTestId('bg-key-00ff00')).toBeTruthy();
      expect(screen.getByTestId('bg-key-ff00ff')).toBeTruthy();
      expect(screen.getByTestId('bg-color')).toBeTruthy();
      expect(screen.getByTestId('bg-tolerance')).toBeTruthy();

      // Picking a different preset updates the active key.
      fireEvent.click(screen.getByTestId('bg-key-ff00ff'));
      expect(screen.getByTestId('bg-key-ff00ff').getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByTestId('bg-key-00ff00').getAttribute('aria-pressed')).toBe('false');
    });

    it('applies keying, creates a "(BG removed)" copy in ONE undo step and retargets', async () => {
      mockRemoveBg.mockResolvedValue('data:image/png;base64,CLEANED');
      targetFlag();
      render(<CanvasActionBar />);
      fireEvent.click(screen.getByTestId('remove-bg-btn'));
      fireEvent.click(screen.getByTestId('bg-key-ff00ff'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('bg-apply'));
        await Promise.resolve();
      });

      expect(mockRemoveBg).toHaveBeenCalledWith(seedAsset.src, '#ff00ff', 30);
      const scene = useSceneStore.getState().scene;
      const copies = Object.values(scene.assets).filter(
        (a) => a.id !== 'flag-1' && a.name === 'flag (BG removed)'
      );
      expect(copies).toHaveLength(1);
      expect(copies[0].src).toBe('data:image/png;base64,CLEANED');
      // Original untouched (non-destructive PRD §43).
      expect(scene.assets['flag-1'].src).toBe(seedAsset.src);
      // ONE undo step total (registerAsset is additive, no snapshot).
      expect(useSceneStore.getState().past).toHaveLength(1);
      // Popover closes and the copy becomes the new toolbar target.
      expect(screen.queryByTestId('bg-remover')).toBeNull();
      expect(useSceneStore.getState().bgTargetAssetId).toBe(copies[0].id);
      expect(screen.getByTestId('toolbar-status').textContent).toContain(
        'Background removed — created “flag (BG removed)”'
      );
    });
  });

  describe('battle FX (collision-triggered bursts)', () => {
    const addUnit = (id: string, faction: 'red' | 'blue', x: number) => {
      act(() => {
        const st = useSceneStore.getState();
        st.addObject({
          id,
          type: 'unit',
          faction,
          transform: { x, y: 0, rotation: 0, scale: 1, opacity: 1 },
          layerId: st.activeLayerId,
        });
      });
    };

    it('reports no clashes when there are no opposing units', () => {
      render(<CanvasActionBar />);
      fireEvent.click(screen.getByTestId('battle-fx-btn'));
      expect(screen.getByTestId('toolbar-status').textContent).toContain(
        'Battle FX: no opposing-unit clashes detected'
      );
    });

    it('materializes bursts for an opposing pair within range, one undo step', () => {
      addUnit('red-1', 'red', 100);
      addUnit('blue-1', 'blue', 120); // 20 apart < 120 default threshold
      const pastBefore = useSceneStore.getState().past.length;
      render(<CanvasActionBar />);
      fireEvent.click(screen.getByTestId('battle-fx-btn'));
      const st = useSceneStore.getState();
      expect(st.scene.effects).toBeDefined();
      expect(Object.keys(st.scene.effects!)).toHaveLength(2);
      expect(st.past).toHaveLength(pastBefore + 1); // ONE transaction/undo step
      expect(screen.getByTestId('toolbar-status').textContent).toContain(
        'Battle FX: 2 bursts at'
      );
    });
  });
});
