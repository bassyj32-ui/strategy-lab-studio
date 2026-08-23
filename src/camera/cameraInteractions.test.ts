// @vitest-environment jsdom
// Tests for camera interaction helpers + their wiring into the scene store.
// Covers the functional-audit fixes: wheel deltaMode normalization (Firefox),
// the extracted drop-coordinate conversion, pan-gesture bookkeeping, and the
// "undo/redo never teleports the viewport" law (PRD §87).
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  DELTA_PIXEL,
  DELTA_LINE,
  DELTA_PAGE,
  LINE_HEIGHT_PX,
  PAGE_HEIGHT_PX,
  normalizeWheelDelta,
  wheelDeltaToFactor,
  clientToStagePoint,
  useCameraPan,
} from './cameraInteractions';
import { useSceneStore } from '../scene/store';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';
import type { Vec2 } from '../scene/types';

const reset = () => {
  act(() => {
    useSceneStore.setState({
      scene: createDefaultScene(),
      past: [],
      future: [],
      selectedObjId: null,
      activeLayerId: DEFAULT_LAYER_ID,
    });
  });
};

describe('normalizeWheelDelta', () => {
  it('1a. passes PIXEL-mode deltas through untouched (Chrome/Safari)', () => {
    expect(normalizeWheelDelta(100)).toBe(100);
    expect(normalizeWheelDelta(-45, DELTA_PIXEL)).toBe(-45);
    expect(normalizeWheelDelta(0, DELTA_PIXEL)).toBe(0);
  });

  it('1b. scales LINE-mode deltas to pixels (Firefox fix)', () => {
    // One Firefox notch ≈ ±3 lines -> must feel like ~±48 px, NOT ±3 px.
    expect(normalizeWheelDelta(3, DELTA_LINE)).toBe(3 * LINE_HEIGHT_PX);
    expect(normalizeWheelDelta(-3, DELTA_LINE)).toBe(-3 * LINE_HEIGHT_PX);
  });

  it('1c. scales PAGE-mode deltas to pixels', () => {
    expect(normalizeWheelDelta(2, DELTA_PAGE)).toBe(2 * PAGE_HEIGHT_PX);
  });

  it('1d. makes Firefox one-notch zoom MEANINGFUL (audit regression)', () => {
    // Before the fix: exp(-3 * 0.0015) ~= 0.9955 -> ~0.45% per notch.
    const firefoxNotchPx = normalizeWheelDelta(3, DELTA_LINE);
    const factor = wheelDeltaToFactor(firefoxNotchPx);
    expect(factor).toBeLessThan(0.95); // clearly visible zoom-out per notch
    const inverse = wheelDeltaToFactor(-firefoxNotchPx);
    expect(inverse).toBeGreaterThan(1 / 0.95);
  });
});

describe('clientToStagePoint (drop-coordinate conversion)', () => {
  it('2a. maps client coords through a CSS-scaled container (scale 0.5)', () => {
    // Stage is logically 1920x1080, visually squeezed into 960x540.
    const rect = { left: 100, top: 50, width: 960, height: 540 };
    const p = clientToStagePoint(rect, 1920, 1080, 100 + 480, 50 + 270);
    expect(p.x).toBeCloseTo(960, 6); // visual centre -> logical centre
    expect(p.y).toBeCloseTo(540, 6);
  });

  it('2b. is exact at corners of an unscaled container', () => {
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    const tl = clientToStagePoint(rect, 800, 600, 0, 0);
    const br = clientToStagePoint(rect, 800, 600, 800, 600);
    expect(tl).toEqual({ x: 0, y: 0 });
    expect(br.x).toBeCloseTo(800, 6);
    expect(br.y).toBeCloseTo(600, 6);
  });

  it('2c. degrades to origin for degenerate rects (hidden container)', () => {
    const rect = { left: 0, top: 0, width: 0, height: 0 };
    expect(clientToStagePoint(rect, 800, 600, 10, 10)).toEqual({ x: 0, y: 0 });
  });
});

describe('useCameraPan gesture bookkeeping', () => {
  it('3. reports per-move deltas while dragging and stops after pointer-up', () => {
    const seen: Vec2[] = [];
    let pointer: Vec2 | null = { x: 0, y: 0 };
    const { result } = renderHook(() =>
      useCameraPan({
        getPointer: () => pointer,
        onPan: (dx, dy) => seen.push({ x: dx, y: dy }),
      }),
    );

    // Moves before pointer-down must be ignored (no accidental pans on hover).
    act(() => result.current.onPointerMove());
    expect(seen).toHaveLength(0);

    act(() => result.current.onPointerDown());
    act(() => {
      pointer = { x: 12, y: -4 };
      result.current.onPointerMove();
    }); // delta (12, -4)
    act(() => {
      pointer = { x: 20, y: -4 };
      result.current.onPointerMove();
    }); // delta (8, 0)
    expect(seen).toEqual([
      { x: 12, y: -4 },
      { x: 8, y: 0 },
    ]);

    // Pointer-up ends the gesture: later moves report nothing.
    act(() => result.current.onPointerUp());
    act(() => {
      pointer = { x: 500, y: 500 };
      result.current.onPointerMove();
    });
    expect(seen).toHaveLength(2);
  });

  it('3b. survives a null pointer mid-gesture without firing onPan', () => {
    let seen = 0;
    let pointer: Vec2 | null = { x: 1, y: 1 };
    const { result } = renderHook(() =>
      useCameraPan({
        getPointer: () => pointer,
        onPan: () => {
          seen += 1;
        },
      }),
    );
    act(() => result.current.onPointerDown());
    act(() => {
      pointer = null; // pointer left the stage
      result.current.onPointerMove();
    });
    expect(seen).toBe(0);
  });
});

describe('camera <-> store integration (PRD §87)', () => {
  beforeEach(reset);

  it('4. pan/zoom write Scene.camera WITHOUT creating undo entries', () => {
    const s = useSceneStore.getState();
    const x0 = s.scene.camera.x;
    act(() => s.updateCamera((cam) => ({ ...cam, zoom: 2.5 })));
    act(() => s.updateCamera((cam) => ({ ...cam, x: cam.x - 120 })));
    const state = useSceneStore.getState();
    expect(state.scene.camera.zoom).toBe(2.5);
    expect(state.scene.camera.x).toBe(x0 - 120);
    // Navigation state is not content: no snapshots pushed, nothing to undo.
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
  });

  it('5. undo/redo keep the live camera stable across content restores', () => {
    // Park the view somewhere distinctive.
    act(() =>
      useSceneStore.getState().updateCamera((cam) => ({
        ...cam,
        x: -333,
        y: 444,
        zoom: 3.25,
      })),
    );
    // Create real content (one undoable transaction).
    let id: string;
    act(() => {
      id = useSceneStore.getState().createObjectOfType('shape');
    });
    expect(useSceneStore.getState().past).toHaveLength(1);

    act(() => useSceneStore.getState().undo());
    let cam = useSceneStore.getState().scene.camera;
    expect(cam).toEqual({ x: -333, y: 444, zoom: 3.25 }); // NOT teleported

    act(() => useSceneStore.getState().redo());
    cam = useSceneStore.getState().scene.camera;
    expect(cam).toEqual({ x: -333, y: 444, zoom: 3.25 });
    expect(Object.keys(useSceneStore.getState().scene.objects)).toContain(id!);
  });
});
