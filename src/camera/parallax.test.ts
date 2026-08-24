import { describe, it, expect } from 'vitest';
import {
  applyParallax,
  layerCamera,
  layerDepthFactor,
  parallaxLayerTransform,
} from './parallax';
import { worldToScreen, type Viewport } from './cameraMath';
import type { CameraState, Layer } from '../scene/types';

const CAM: CameraState = { x: 700, y: 420, zoom: 1.6, rotation: 0.3 };
const CENTRE = { x: 960, y: 540 };
const VP: Viewport = { width: 958, height: 540 };

describe('layerDepthFactor', () => {
  it('defaults to 1 when absent', () => {
    expect(layerDepthFactor({ id: 'l', name: 'L', visible: true, order: 0 })).toBe(1);
    expect(
      layerDepthFactor({ id: 'l', name: 'L', visible: true, order: 0, depthFactor: 0.4 })
    ).toBe(0.4);
  });
});

describe('applyParallax', () => {
  it('is the exact identity at factor 1 (byte-stability guarantee)', () => {
    const d = applyParallax(CAM, 1, CENTRE);
    expect(d.x).toBe(CAM.x);
    expect(d.y).toBe(CAM.y);
    expect(d.zoom).toBe(CAM.zoom);
    expect(d.rotation).toBe(CAM.rotation);
  });

  it('pins the layer to the map plane at factor 0', () => {
    const d = applyParallax(CAM, 0, CENTRE);
    expect(d.x).toBe(CENTRE.x);
    expect(d.y).toBe(CENTRE.y);
    expect(d.zoom).toBe(1);
    expect(d.rotation).toBe(0);
  });

  it('scales position offset from the centre, zoom and rotation proportionally', () => {
    const d = applyParallax(CAM, 0.5, CENTRE);
    expect(d.x).toBeCloseTo(960 + (700 - 960) * 0.5); // 830
    expect(d.y).toBeCloseTo(540 + (420 - 540) * 0.5); // 480
    expect(d.zoom).toBeCloseTo(1 + 0.6 * 0.5); // 1.3
    expect(d.rotation).toBeCloseTo(0.15);
  });
});

describe('parallaxLayerTransform', () => {
  it('is identity when the parallaxed camera equals the base camera', () => {
    const t = parallaxLayerTransform(CAM, CAM);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(0);
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(1);
    expect(t.rotation).toBeCloseTo(0);
  });

  it('composes with the Stage transform to reproduce the parallaxed projection', () => {
    const f = 0.35;
    const d = applyParallax(CAM, f, CENTRE);
    const t = parallaxLayerTransform(CAM, d);

    // Apply the Konva layer transform FIRST (child space), then the Stage
    // transform — must equal projecting P directly through `d`.
    for (const P of [
      { x: 100, y: 200 },
      { x: 1500, y: 900 },
      { x: 960, y: 540 },
    ]) {
      const cos = Math.cos((t.rotation * Math.PI) / 180);
      const sin = Math.sin((t.rotation * Math.PI) / 180);
      const lx = t.x + t.scaleX * (cos * P.x - sin * P.y);
      const ly = t.y + t.scaleY * (sin * P.x + cos * P.y);
      const viaLayer = worldToScreen({ x: lx, y: ly }, CAM, VP);
      const direct = worldToScreen(P, d, VP);
      expect(viaLayer.x).toBeCloseTo(direct.x, 6);
      expect(viaLayer.y).toBeCloseTo(direct.y, 6);
    }
  });
});

describe('layerCamera', () => {
  it('uses the world centre as the parallax anchor', () => {
    const sceneCam: CameraState = { x: 300, y: 900, zoom: 2 };
    const layer: Layer = {
      id: 'l',
      name: 'L',
      visible: true,
      order: 0,
      depthFactor: 0.25,
    };
    const d = layerCamera(sceneCam, layer, { w: 1920, h: 1080 });
    expect(d.x).toBeCloseTo(960 + (300 - 960) * 0.25); // 795
    expect(d.y).toBeCloseTo(540 + (900 - 540) * 0.25); // 630
    expect(d.zoom).toBeCloseTo(1.25);
  });
});
