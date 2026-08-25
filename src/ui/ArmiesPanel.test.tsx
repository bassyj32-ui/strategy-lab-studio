// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ArmiesPanel } from './ArmiesPanel';
import { useSceneStore } from '../scene/store';
import { useTimelineSelection } from '../timeline/selection';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';
import type { ObjId } from '../scene/types';

const reset = () => {
  act(() => {
    useSceneStore.setState({
      scene: createDefaultScene(),
      past: [],
      future: [],
      selectedObjId: null,
      selectedIds: [],
      activeLayerId: DEFAULT_LAYER_ID,
    });
    useTimelineSelection.setState({
      selectedObjId: null,
      selectedKeyframeTime: null,
    });
  });
};

const seed = () => {
  let a: ObjId;
  let b: ObjId;
  act(() => {
    const st = useSceneStore.getState();
    a = st.createObjectOfType('unit');
    b = st.createObjectOfType('unit');
    // Give display names so the tree is human (owner workflow).
    st.renameObject(a!, 'Hannibal');
    st.renameObject(b!, 'Varro');
  });
  return { a: a!, b: b! };
};

describe('ArmiesPanel', () => {
  beforeEach(reset);
  afterEach(cleanup);

  it('renders roots as named rows with faction dots; empty state hints', () => {
    const { a } = seed();
    render(<ArmiesPanel />);
    expect(screen.getByTestId(`armies-row-${a}`)?.textContent).toContain(
      'Hannibal'
    );
    expect(screen.queryByText(/No units yet/i)).toBeNull();

    // Empty army -> hint.
    cleanup();
    reset();
    render(<ArmiesPanel />);
    expect(screen.getByText(/No units yet/i)).toBeTruthy();
  });

  it('row click selects on BOTH stores; shift-click toggles multi-select', () => {
    const { a, b } = seed();
    render(<ArmiesPanel />);

    fireEvent.click(screen.getByTestId(`armies-row-${a}`));
    expect(useSceneStore.getState().selectedObjId).toBe(a);
    expect(useTimelineSelection.getState().selectedObjId).toBe(a);

    fireEvent.click(screen.getByTestId(`armies-row-${b}`), { shiftKey: true });
    expect(useSceneStore.getState().selectedIds).toEqual([a, b]);
  });

  it('Group nests the selection as one undoable step; Ungroup dissolves', () => {
    const { a, b } = seed();
    render(<ArmiesPanel />);

    const groupBtn = screen.getByTestId('armies-group') as HTMLButtonElement;
    expect(groupBtn.disabled).toBe(true); // nothing selected

    fireEvent.click(screen.getByTestId(`armies-row-${a}`));
    fireEvent.click(screen.getByTestId(`armies-row-${b}`), { shiftKey: true });
    expect(groupBtn.disabled).toBe(false);

    fireEvent.click(groupBtn);
    const objects = useSceneStore.getState().scene.objects;
    const parented = Object.values(objects).filter((o) => o.parentId != null);
    expect(parented).toHaveLength(1); // one under the other (no synthetic node)

    // One undo restores two loose roots.
    act(() => useSceneStore.getState().undo());
    expect(
      Object.values(useSceneStore.getState().scene.objects).every(
        (o) => o.parentId == null
      )
    ).toBe(true);

    // Ungroup path: select the CHILD (parentId set), dissolve its group.
    act(() => {
      useSceneStore.getState().groupObject([a, b]);
    });
    const childId = Object.values(
      useSceneStore.getState().scene.objects
    ).find((o) => o.parentId != null)!.id;
    act(() => {
      useSceneStore.getState().setSelectedIds([childId]);
    });
    const ungroupBtn = screen.getByTestId('armies-ungroup') as HTMLButtonElement;
    expect(ungroupBtn.disabled).toBe(false);
    fireEvent.click(ungroupBtn);
    expect(
      Object.values(useSceneStore.getState().scene.objects).every(
        (o) => o.parentId == null
      )
    ).toBe(true);
  });

  it('groups expand/collapse and children render indented rows', () => {
    const { a, b } = seed();
    act(() => {
      useSceneStore.getState().groupObject([a, b]); // b parented under a
    });
    render(<ArmiesPanel />);

    // Child row visible while expanded.
    expect(screen.getByTestId(`armies-row-${b}`)).toBeTruthy();
    const twist = screen.getByTestId(`armies-twist-${a}`);
    expect(twist.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(twist);
    expect(twist.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId(`armies-row-${b}`)).toBeNull();
  });

  it('filter narrows to matching display names', () => {
    const { a } = seed();
    render(<ArmiesPanel />);
    fireEvent.change(screen.getByTestId('armies-filter'), {
      target: { value: 'varro' },
    });
    expect(screen.queryByTestId(`armies-row-${a}`)).toBeNull();
    expect(screen.getAllByTestId(/^armies-row-/)).toHaveLength(1);

    fireEvent.change(screen.getByTestId('armies-filter'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText(/No units match/i)).toBeTruthy();
  });
});
