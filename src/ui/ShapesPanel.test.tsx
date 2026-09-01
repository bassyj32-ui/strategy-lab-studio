// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ShapesPanel } from './ShapesPanel';
import { useSceneStore } from '../scene/store';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';

const reset = () => {
  act(() => {
    useSceneStore.setState({
      scene: createDefaultScene(),
      past: [],
      future: [],
      selectedObjId: null,
      activeLayerId: DEFAULT_LAYER_ID,
      shapeTargetId: null,
    });
  });
};

const registerSprite = (id: string, name: string, faction: string) => {
  act(() => {
    useSceneStore.getState().registerAssets([
      {
        id,
        kind: 'sprite' as const,
        name,
        src: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1,
        height: 1,
        metadata: { aspectRatio: 1, defaultScale: 1, faction: faction as never },
      },
    ]);
  });
};

describe('ShapesPanel', () => {
  beforeEach(reset);

  it('renders all six formation patterns with Create + Add controls', () => {
    render(<ShapesPanel />);
    for (const p of [
      'line', 'column', 'wedge', 'grid', 'crescent', 'circle',
    ]) {
      expect(screen.getByTestId(`shape-pattern-${p}`)).toBeTruthy();
    }
    expect(screen.getByTestId('shape-create')).toBeTruthy();
    expect(screen.getByTestId('shape-add-unit')).toBeTruthy();
    // Radius only shows for radius-based patterns.
    expect(screen.queryByTestId('shape-radius')).toBeNull();
  });

  it('radius input appears only for crescent/circle', () => {
    render(<ShapesPanel />);
    fireEvent.click(screen.getByTestId('shape-pattern-crescent'));
    expect(screen.getByTestId('shape-radius')).toBeTruthy();
    fireEvent.click(screen.getByTestId('shape-pattern-line'));
    expect(screen.queryByTestId('shape-radius')).toBeNull();
  });

  it('createShapeGroup + addUnitToShape create an empty group with one unit', () => {
    registerSprite('sp1', 'hoplite', 'red');
    render(<ShapesPanel />);
    fireEvent.click(screen.getByTestId('shape-pattern-circle'));
    const before = useSceneStore.getState().past.length;
    fireEvent.click(screen.getByTestId('shape-create'));
    const s = useSceneStore.getState();
    // Create = TWO discrete undo steps (createShapeGroup, then the auto-add
    // of the first unit) — each its own transaction, both reversible.
    expect(s.past.length).toBe(before + 2);
    const gid = s.shapeTargetId!;
    const group = s.scene.objects[gid];
    expect(group.type).toBe('group');
    expect(group.formation?.pattern).toBe('circle');
    // Create auto-adds a first unit using the matched faction sprite.
    const children = Object.values(s.scene.objects).filter((o) => o.parentId === gid);
    expect(children).toHaveLength(1);
    expect(children[0].faction).toBe('red');
  });

  it('add-unit requires a target group and drops another unit onto it', () => {
    registerSprite('sp1', 'hoplite', 'red');
    render(<ShapesPanel />);
    // Disabled until a shape target exists.
    expect((screen.getByTestId('shape-add-unit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('shape-create'));
    expect((screen.getByTestId('shape-add-unit') as HTMLButtonElement).disabled).toBe(false);
    const gid = useSceneStore.getState().shapeTargetId!;
    fireEvent.click(screen.getByTestId('shape-add-unit'));
    const children = Object.values(useSceneStore.getState().scene.objects).filter(
      (o) => o.parentId === gid
    );
    expect(children).toHaveLength(2);
  });
});
