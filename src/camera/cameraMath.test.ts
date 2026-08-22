// Pure-math tests for the camera module. No DOM/canvas needed.
import { describe, it, expect } from 'vitest';
import type { CameraState, Vec2 } from '../scene/types';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  clampZoom,
  worldToScreen,
  screenToWorld,
  panCamera,
  zoomAtPoint,
  cameraToStageProps,
  type Viewport,
  type StageProps,
} from './cameraMath';
import { wheelDeltaToFactor } from './cameraInteractions';

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
});
