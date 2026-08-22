// Store-level integration test for the camera.
//
// useCamera() is just a thin React wrapper that calls the store's
// `updateCamera(updater)` with `panCamera` / `zoomAtPoint`. Those two pure
// functions are already covered in cameraMath.test.ts. Here we guard the
// CONTRACT that matters for the editor: the camera lives in Scene.camera
// (single source of truth) and `updateCamera` actually COMMITS a new camera
// there — and that committing panCamera / zoomAtPoint through the store
// produces the same behavior the canvas relies on. No DOM needed.
import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from '../scene/store';
import { MAX_ZOOM, panCamera, zoomAtPoint, worldToScreen, screenToWorld, type Viewport } from './cameraMath';

// A fixed viewport + a couple of known world points used to assert behavior.
const VP: Viewport = { width: 1000, height: 800 };
const POINT = { x: 123, y: 456 };
const SCREEN_POINT = { x: 900, y: 400 };

// Reset to a clean, known camera before each test (the store is a singleton).
beforeEach(() => {
  useSceneStore.getState().updateCamera(() => ({
    x: 0,
    y: 0,
    zoom: 1,
    rotation: 0,
  }));
});

describe('scene.camera as single source of truth', () => {
  it('1. updateCamera writes the new camera into scene.camera', () => {
    const before = useSceneStore.getState().scene.camera;
    expect(before).toEqual({ x: 0, y: 0, zoom: 1, rotation: 0 });

    useSceneStore.getState().updateCamera((cam) => ({
      ...cam,
      x: 42,
      y: -7,
      zoom: 2,
    }));

    const after = useSceneStore.getState().scene.camera;
    expect(after.x).toBe(42);
    expect(after.y).toBe(-7);
    expect(after.zoom).toBe(2);
  });

  it('2. updateCamera produces a NEW camera object (immutability -> re-render)', () => {
    const before = useSceneStore.getState().scene.camera;
    useSceneStore.getState().updateCamera((cam) => ({ ...cam, x: 99 }));
    const after = useSceneStore.getState().scene.camera;

    // Must be a fresh reference so React/Zustand subscribers see a change.
    expect(after).not.toBe(before);
  });

  it('3. committing panCamera through the store shifts a world point on screen by exactly (dx,dy)', () => {
    const cam0 = useSceneStore.getState().scene.camera;
    const s0 = worldToScreen(POINT, cam0, VP);

    const dx = 30;
    const dy = -15;
    useSceneStore.getState().updateCamera((cam) => panCamera(cam, dx, dy));

    const cam1 = useSceneStore.getState().scene.camera;
    const s1 = worldToScreen(POINT, cam1, VP);
    expect(s1.x).toBeCloseTo(s0.x + dx, 6);
    expect(s1.y).toBeCloseTo(s0.y + dy, 6);
  });

  it('4. committing zoomAtPoint through the store anchors the cursor world point and clamps zoom', () => {
    const cam0 = useSceneStore.getState().scene.camera;
    const worldBefore = screenToWorld(SCREEN_POINT, cam0, VP);

    // Huge zoom-in -> must clamp to MAX_ZOOM, still anchored at the cursor.
    useSceneStore.getState().updateCamera((cam) => zoomAtPoint(cam, VP, 1000, SCREEN_POINT));

    const cam1 = useSceneStore.getState().scene.camera;
    expect(cam1.zoom).toBe(MAX_ZOOM);

    const worldAfter = screenToWorld(SCREEN_POINT, cam1, VP);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });
});
