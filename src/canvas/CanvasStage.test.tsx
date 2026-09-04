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
  // Konva-only props that React would warn about as unknown DOM attributes.
  // Strip them before they reach the plain-div stand-ins.
  const STRIP = new Set([
    'x',
    'y',
    'rotation',
    'opacity',
    'draggable',
    'width',
    'height',
    'fill',
    'stroke',
    'strokeWidth',
    'points',
    'closed',
    'dash',
    'image',
    'align',
    'fontSize',
    'fontStyle',
    'text',
    'radiusX',
    'radiusY',
    'scaleX',
    'scaleY',
    'offsetX',
    'offsetY',
    'verticalAlign',
    'onDragMove',
    'onDragStart',
    'onDragEnd',
    'onTap',
    'onDblClick',
    'strokeScaleEnabled',
    'hitStrokeWidth',
    'shadowColor',
    'shadowBlur',
    'shadowOffsetX',
    'shadowOffsetY',
    'shadowZoom',
    'wantShadow',
    'listening',
    'fillEnabled',
    'strokeEnabled',
    'cornerRadius',
    'lineCap',
    'lineJoin',
  ]);
  const clean = (props: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (!STRIP.has(k)) out[k] = v;
    }
    return out;
  };
  const make = (tag: string) =>
    R.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { children, ...rest } = props;
      return R.createElement(tag, { ...clean(rest), ref }, children as ReactNode);
    });
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
  it('renders Figma-style handles (4 corners + 4 edges + stalk, NO center move dot)', () => {
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
    // 4 corner handles + 4 edge handles + rotation stalk…
    for (const c of ['nw', 'ne', 'se', 'sw']) {
      expect(container.querySelector(`[data-testid="gizmo-corner-${c}"]`)).toBeTruthy();
    }
    for (const e of ['n', 's', 'e', 'w']) {
      expect(container.querySelector(`[data-testid="gizmo-edge-${e}"]`)).toBeTruthy();
    }
    expect(container.querySelector('[data-testid="gizmo-stalk"]')).toBeTruthy();
    // …and NO competing center move dot: move = drag the body itself.
    expect(container.querySelector('[data-testid="gizmo-move"]')).toBeFalsy();
  });

  it('renders scale + stalk handles for a grouped child', () => {
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
    expect(container.querySelector('[data-testid="gizmo-corner-se"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gizmo-stalk"]')).toBeTruthy();
  });

  it('does not emit React unknown-prop warnings for Konva-only props', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
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
      render(<CanvasStage />);
      const unknownPropCalls = spy.mock.calls.filter((args) =>
        args.some(
          (a) =>
            typeof a === 'string' &&
            (a.includes('Unknown event handler') ||
              a.includes('React does not recognize') ||
              a.includes('Invalid DOM property'))
        )
      );
      expect(unknownPropCalls).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
