// Pure-math tests for the camera module. No DOM/canvas needed.
import { describe, it, expect } from 'vitest';
import type { CameraState, Vec2 } from '../scene/types';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  clampZoom,
  resetCamera,
  worldToScreen,
  screenToWorld,
  panCamera,
  zoomAtPoint,
  cameraToStageProps,
  type Viewport,
  type StageProps,
} from './cameraMath';
import { wheelDeltaToFactor, normalizeWheelDelta, clientToStagePoint } from './cameraInteractions';

const VPS: Viewport[] = [
  { width: 1280, height: 720 },
  { width: 800, height: 600 },
];

const CAMS: CameraState[] = [
  { x: 0, y: 0, zoom: 1, rotation: 0 },
  { x: 100, y: -50, zoom: 2, rotation: 0 },
  { x: 10, y: 20, zoom: 0.5, rotation: Math.PI / 4 },
  { x: -30, y: 40, zoom: 3, rotation: Math.PI / 3 },
];

const POINTS: Vec2[] = [
  { x: 0, y: 0 },
  { x: 123, y: -45 },
  { x: -200, y: 300 },
  { x: 50, y: 50 },
];

describe('camera math', () => {
  it('1. round-trips world<->screen for various cameras/viewports', () => {
    for (const vp of VPS) {
      for (const cam of CAMS) {
        for (const p of POINTS) {
          const s = worldToScreen(p, cam, vp);
          const back = screenToWorld(s, cam, vp);
          expect(back.x).toBeCloseTo(p.x, 6);
          expect(back.y).toBeCloseTo(p.y, 6);
        }
      }
    }
  });

  it('2. identity camera maps world ~= screen - center', () => {
    const cam: CameraState = { x: 0, y: 0, zoom: 1, rotation: 0 };
    const vp: Viewport = { width: 1280, height: 720 };
    const p: Vec2 = { x: 37, y: -12 };
    const s = worldToScreen(p, cam, vp);
    expect(s.x).toBeCloseTo(p.x + vp.width / 2, 6);
    expect(s.y).toBeCloseTo(p.y + vp.height / 2, 6);
  });

  it('3. zoomAtPoint anchors the cursor world point', () => {
    const cam: CameraState = { x: 50, y: 30, zoom: 1, rotation: 0 };
    const vp: Viewport = { width: 1280, height: 720 };
    const screenPoint: Vec2 = { x: 900, y: 400 };
    const worldBefore = screenToWorld(screenPoint, cam, vp);
    for (const factor of [1.5, 0.7, 2.0]) {
      const newCam = zoomAtPoint(cam, vp, factor, screenPoint);
      const worldAfter = screenToWorld(screenPoint, newCam, vp);
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
    }
  });

  it('4. panCamera shifts a fixed world point on screen by exactly (dx,dy)', () => {
    const cam: CameraState = { x: 20, y: 10, zoom: 2, rotation: 0 };
    const vp: Viewport = { width: 1000, height: 800 };
    const p: Vec2 = { x: 123, y: 456 };
    const s0 = worldToScreen(p, cam, vp);
    const dx = 30;
    const dy = -15;
    const panned = panCamera(cam, dx, dy);
    const s1 = worldToScreen(p, panned, vp);
    expect(s1.x).toBeCloseTo(s0.x + dx, 6);
    expect(s1.y).toBeCloseTo(s0.y + dy, 6);
  });

  it('5. zoom clamps to MIN/MAX', () => {
    const cam: CameraState = { x: 0, y: 0, zoom: 1, rotation: 0 };
    const vp: Viewport = { width: 1280, height: 720 };
    const tooBig = zoomAtPoint(cam, vp, 1000, { x: 100, y: 100 });
    expect(tooBig.zoom).toBe(MAX_ZOOM);
    const tooSmall = zoomAtPoint(cam, vp, 0.0001, { x: 100, y: 100 });
    expect(tooSmall.zoom).toBe(MIN_ZOOM);
  });

  it('6. cameraToStageProps matches worldToScreen (Konva binding)', () => {
    // Reproduce Konva's transform: screen = (x,y) + R(rot) * (scale * P).
    const stageScreen = (P: Vec2, props: StageProps): Vec2 => {
      const rot = (props.rotation * Math.PI) / 180;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const dx = props.scaleX * P.x;
      const dy = props.scaleY * P.y;
      const rx = cos * dx - sin * dy;
      const ry = sin * dx + cos * dy;
      return { x: props.x + rx, y: props.y + ry };
    };

    for (const vp of VPS) {
      for (const cam of CAMS) {
        const props = cameraToStageProps(cam, vp);
        for (const p of POINTS) {
          const a = worldToScreen(p, cam, vp);
          const b = stageScreen(p, props);
          expect(b.x).toBeCloseTo(a.x, 6);
          expect(b.y).toBeCloseTo(a.y, 6);
        }
      }
    }
  });

  it('7. wheelDeltaToFactor behaves correctly', () => {
    expect(wheelDeltaToFactor(0)).toBeCloseTo(1, 6);
    expect(wheelDeltaToFactor(-100)).toBeGreaterThan(1);
    expect(wheelDeltaToFactor(100)).toBeLessThan(1);
    expect(wheelDeltaToFactor(-100)).toBeGreaterThan(wheelDeltaToFactor(100));
  });

  it('8. clampZoom keeps a value inside [MIN_ZOOM, MAX_ZOOM]', () => {
    // Within range: passes through untouched.
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(clampZoom(2.5)).toBe(2.5);
    // Out of range: pinned to the nearest bound.
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(-5)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MAX_ZOOM);
  });

  it('9. zoomAtPoint still anchors the cursor when zoom gets clamped (even rotated)', () => {
    // A huge zoom-in would shoot past MAX_ZOOM; the world point under the
    // cursor must STILL stay anchored (zoom is clamped, but the anchor math
    // uses the clamped zoom).
    const cam: CameraState = { x: 50, y: 30, zoom: 1, rotation: Math.PI / 4 };
    const vp: Viewport = { width: 1280, height: 720 };
    const screenPoint: Vec2 = { x: 900, y: 400 };
    const worldBefore = screenToWorld(screenPoint, cam, vp);

    const newCam = zoomAtPoint(cam, vp, 1000, screenPoint);
    expect(newCam.zoom).toBe(MAX_ZOOM); // zoom was clamped

    const worldAfter = screenToWorld(screenPoint, newCam, vp);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  // ---- HUD support math (CameraHud routes through these) ----

  it('10. resetCamera returns the default view inside the clamp', () => {
    const r = resetCamera();
    expect(r).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(clampZoom(r.zoom)).toBe(r.zoom);
  });

  it('11. HUD steps are exact reciprocals and land on EXACT bounds', () => {
    // Zoom In / Zoom Out use ZOOM_STEP around the viewport centre.
    expect(ZOOM_STEP * (1 / ZOOM_STEP)).toBeCloseTo(1, 12);
    const vp: Viewport = { width: 1920, height: 1080 };
    const centre: Vec2 = { x: vp.width / 2, y: vp.height / 2 };

    let cam: CameraState = resetCamera();
    for (let i = 0; i < 50; i++) {
      cam = zoomAtPoint(cam, vp, ZOOM_STEP, centre);
      // Anchoring at the centre keeps the camera position pinned there.
      expect(cam.x).toBeCloseTo(0, 6);
      expect(cam.y).toBeCloseTo(0, 6);
    }
    expect(cam.zoom).toBe(MAX_ZOOM); // clamps exactly, never past it

    for (let i = 0; i < 80; i++) {
      cam = zoomAtPoint(cam, vp, 1 / ZOOM_STEP, centre);
    }
    expect(cam.zoom).toBe(MIN_ZOOM);
    expect(cam.x).toBeCloseTo(0, 6);
    expect(cam.y).toBeCloseTo(0, 6);
  });

  it('12. drop pipeline lands objects under the cursor at extreme pan/zoom', () => {
    // Full pure chain used by handleDrop: client px -> stage px -> world,
    // verified by projecting back to the screen. Uses an aggressively
    // panned + max-zoomed camera so any drift in the chain fails loudly.
    const vp: Viewport = { width: 1920, height: 1080 };
    let cam: CameraState = resetCamera();
    cam = zoomAtPoint(cam, vp, 1000, { x: 1500, y: 700 }); // -> MAX_ZOOM, anchored
    cam = panCamera(cam, -400, 250);

    // CSS preview scale(0.5): logical 1920x1080 shown in a 960x540 box
    // offset within the page. The user drops at client (733, 411).
    const rect = { left: 120, top: 90, width: 960, height: 540 };
    const sp = clientToStagePoint(rect, vp.width, vp.height, 733, 411);
    expect(sp.x).toBeGreaterThan(0);
    expect(sp.y).toBeGreaterThan(0);

    const world = screenToWorld(sp, cam, vp);
    const backOnScreen = worldToScreen(world, cam, vp);
    expect(backOnScreen.x).toBeCloseTo(sp.x, 6);
    expect(backOnScreen.y).toBeCloseTo(sp.y, 6);
    // And the wheel path that produced `cam` was pixel-normalized:
    expect(normalizeWheelDelta(-120, 0)).toBe(-120);
    expect(wheelDeltaToFactor(normalizeWheelDelta(-120))).toBeGreaterThan(1);
  });
});
