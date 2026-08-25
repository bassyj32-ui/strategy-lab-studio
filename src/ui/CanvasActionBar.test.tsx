// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { CanvasActionBar } from './CanvasActionBar';
import { useSceneStore } from '../scene/store';
import { createDefaultScene } from '../scene/factory';

afterEach(cleanup);

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
  it('renders map/save/export, group/ungroup and the formation builder', () => {
    render(<CanvasActionBar />);
    for (const id of [
      'import-map',
      'save-scene',
      'export-video',
      'group',
      'ungroup',
      'formation-pattern',
      'formation-child-type',
      'formation-count',
      'formation-spacing',
      'create-formation',
      'toolbar-status',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
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

  it('Create Formation spawns a group at map centre and selects it', () => {
    render(<CanvasActionBar />);
    fireEvent.click(screen.getByTestId('create-formation'));
    const st = useSceneStore.getState();
    const objs = Object.values(st.scene.objects);    expect(objs.length).toBeGreaterThan(0);
    expect(st.selectedObjId).not.toBeNull();
    // Formation children are parented under one root.
    const roots = objs.filter((o) => o.parentId == null);
    expect(roots.length).toBe(1);
    expect(roots[0].id).toBe(st.selectedObjId);
    expect(screen.getByTestId('toolbar-status').textContent).toContain(
      'Created line formation'
    );
  });
});
