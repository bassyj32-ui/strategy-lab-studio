// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useSceneStore } from '../scene/store';
import { createDefaultScene } from '../scene/factory';

// `canvas` is not installed, so the real Konva Stage cannot render in jsdom.
// Mock react-konva with plain divs; the Stage mock also exposes the minimal
// imperative surface (container()/width()/height()) that CanvasStage's drop
// handler touches, so we can exercise the asset→unit placement path.
vi.mock('react-konva', async () => {
  const R = await import('react');
  const make = (tag: string) =>
    R.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      R.createElement(tag, { ...props, ref }, props.children as ReactNode)
    );
  const comps: Record<string, unknown> = {
    Stage: R.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      // Provide the imperative handle CanvasStage reads during a drop.
      if (ref && typeof ref === 'object') {
        (ref as { current: unknown }).current = {
          width: () => 1920,
          height: () => 1080,
          container: () => {
            const el = document.createElement('div');
            el.innerHTML = '<div class="konvajs-content"></div>';
            return el;
          },
        };
      }
      return R.createElement('div', { 'data-testid': 'konva-stage' }, props.children as ReactNode);
    }),
    Layer: make('div'),
    Rect: make('div'),
    Line: make('div'),
    Group: make('div'),
    Circle: make('div'),
    Image: make('div'),
    Ellipse: make('div'),
    Text: make('div'),
  };
  return comps;
});

import { CanvasStage } from './CanvasStage';
import { ASSET_DND_MIME } from '../ui/AssetsPanel';

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

const unitAsset = {
  id: 'u1',
  kind: 'sprite' as const,
  name: 'cavalry',
  src: 'data:image/png;base64,yyyy',
  width: 32,
  height: 32,
  metadata: { aspectRatio: 1, defaultScale: 1, category: 'Infantry' as const, faction: 'blue' as const },
};

const markerAsset = {
  id: 'm1',
  kind: 'image' as const,
  name: 'waypoint',
  src: 'data:image/png;base64,zzzz',
  width: 16,
  height: 16,
  metadata: { aspectRatio: 1, defaultScale: 1, category: 'Markers' as const },
};

beforeEach(() => {
  act(() => {
    useSceneStore.setState({ scene: createDefaultScene(), past: [], future: [] });
  });
});

afterEach(cleanup);

function dropOnCanvas(dt: MockDataTransfer) {
  const { container } = render(<CanvasStage />);
  const wrap = container.querySelector('.canvas-wrap') as HTMLElement;
  expect(wrap).toBeTruthy();
  fireEvent.drop(wrap, { dataTransfer: dt as unknown as DataTransfer });
  return useSceneStore.getState().scene;
}

describe('CanvasStage drop → object placement', () => {
  it('drops a unit-category sprite as a UNIT referencing its assetId + faction', () => {
    act(() => {
      useSceneStore.getState().registerAsset(unitAsset);
    });
    const dt = new MockDataTransfer();
    dt.setData(ASSET_DND_MIME, 'u1');
    dt.setData('text/plain', 'unit');

    const scene = dropOnCanvas(dt);
    const created = Object.values(scene.objects).find((o) => o.assetId === 'u1');
    expect(created).toBeTruthy();
    expect(created!.type).toBe('unit');
    expect(created!.assetId).toBe('u1');
    expect(created!.faction).toBe('blue');
  });

  it('drops a Markers asset as a MARKER (text/plain still respected)', () => {
    act(() => {
      useSceneStore.getState().registerAsset(markerAsset);
    });
    const dt = new MockDataTransfer();
    dt.setData(ASSET_DND_MIME, 'm1');
    dt.setData('text/plain', 'marker');

    const scene = dropOnCanvas(dt);
    const created = Object.values(scene.objects).find((o) => o.assetId === 'm1');
    expect(created).toBeTruthy();
    expect(created!.type).toBe('marker');
    expect(created!.assetId).toBe('m1');
  });

  it('palette text/plain="unit" drop (no asset) creates a unit', () => {
    const dt = new MockDataTransfer();
    dt.setData('text/plain', 'unit'); // no ASSET_DND_MIME

    const scene = dropOnCanvas(dt);
    const created = Object.values(scene.objects).find((o) => o.type === 'unit');
    expect(created).toBeTruthy();
    expect(created!.assetId).toBeUndefined();
  });
});

describe('CanvasStage selection gizmos', () => {
  it('renders move handle (gizmo-move) when an object is selected', () => {
    act(() => {
      const st = useSceneStore.getState();
      st.addObject({
        id: 'sel1',
        type: 'unit',
        transform: { x: 100, y: 100, rotation: 0, scale: 1, opacity: 1 },
        layerId: st.activeLayerId,
      });
      useSceneStore.setState({ selectedIds: ['sel1'], selectedObjId: 'sel1' });
    });
    const { container } = render(<CanvasStage />);
    // The gizmo-move circle should be in the DOM (rendered as a div by mock).
    expect(container.querySelector('[data-testid="gizmo-move"]')).toBeTruthy();
  });

  it('renders move handle for a grouped child (moves the group root)', () => {
    act(() => {
      const st = useSceneStore.getState();
      st.addObject({
        id: 'grp',
        type: 'group',
        transform: { x: 200, y: 200, rotation: 0, scale: 1, opacity: 1 },
        layerId: st.activeLayerId,
      });
      st.addObject({
        id: 'child1',
        type: 'unit',
        transform: { x: 210, y: 210, rotation: 0, scale: 1, opacity: 1 },
        layerId: st.activeLayerId,
        parentId: 'grp',
      });
      useSceneStore.setState({ selectedIds: ['child1'], selectedObjId: 'child1' });
    });
    const { container } = render(<CanvasStage />);
    expect(container.querySelector('[data-testid="gizmo-move"]')).toBeTruthy();
  });
});
