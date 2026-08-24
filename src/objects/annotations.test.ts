import { describe, it, expect } from 'vitest';
import {
  FACTION_COLORS,
  CONFIDENCE_META,
  annotationRingRadius,
  labelOffsetY,
  badgeOffsetY,
} from './annotations';
import type { SceneObject, Asset } from '../scene/types';

const obj = (over: Partial<SceneObject> = {}): SceneObject => ({
  id: 'o1',
  type: 'marker',
  layerId: 'layer-root',
  transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
  ...over,
});

const asset = (w: number, h: number): Asset => ({
  id: 'a1',
  kind: 'image',
  name: 'portrait',
  src: 'data:image/png;base64,x',
  width: w,
  height: h,
});

describe('annotations (pure math + palettes)', () => {
  it('faction palette covers red/blue/neutral', () => {
    expect(FACTION_COLORS.red).toMatch(/^#/);
    expect(FACTION_COLORS.blue).toMatch(/^#/);
    expect(FACTION_COLORS.neutral).toMatch(/^#/);
  });

  it('confidence meta carries text + color for each level', () => {
    expect(CONFIDENCE_META.confirmed.text).toBe('CONFIRMED');
    expect(CONFIDENCE_META.probable.text).toBe('PROBABLE');
    expect(CONFIDENCE_META.disputed.text).toBe('DISPUTED');
  });

  it('ring radius encloses an image asset (half diagonal max side)', () => {
    const o = obj({ type: 'unit', assetId: 'a1' });
    expect(annotationRingRadius(o, asset(100, 60))).toBe(60);
  });

  it('ring radius falls back per object kind when no asset', () => {
    expect(annotationRingRadius(obj({ type: 'marker' }))).toBeLessThan(
      annotationRingRadius(obj({ type: 'unit' }))
    );
  });

  it('label sits below the ring, badge above it', () => {
    const r = annotationRingRadius(obj({ type: 'unit' }));
    expect(labelOffsetY(r)).toBeGreaterThan(r);
    expect(badgeOffsetY(r)).toBeLessThan(-r);
  });
});
