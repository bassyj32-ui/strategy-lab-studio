import { describe, it, expect } from 'vitest';
import {
  effectRings,
  effectColor,
  effectBurst,
  instanceActive,
  INSTANCE_BASE_RADIUS,
  BURST_DURATION,
  META,
} from './effects';
import type { EffectKind } from '../scene/types';

const KINDS: EffectKind[] = ['smoke', 'dust', 'impact', 'fire', 'glow'];

describe('effects (§50 procedural overlays)', () => {
  it('every kind has a defined colour and metadata', () => {
    for (const kind of KINDS) {
      expect(effectColor(kind)).toMatch(/^#[0-9a-f]{6}$/);
      expect(META[kind].cycle).toBeGreaterThan(0);
      expect(META[kind].peak).toBeGreaterThan(0);
    }
  });

  it('is deterministic: same kind+time yields identical rings', () => {
    expect(effectRings('smoke', 1.234)).toEqual(effectRings('smoke', 1.234));
    expect(effectRings('fire', 7.5)).toEqual(effectRings('fire', 7.5));
  });

  it('radiusFactor stays within [1.15, 2] at arbitrary times', () => {
    for (const kind of KINDS) {
      for (let t = 0; t < 10; t += 0.37) {
        for (const ring of effectRings(kind, t)) {
          expect(ring.radiusFactor).toBeGreaterThanOrEqual(1.15 - 1e-9);
          expect(ring.radiusFactor).toBeLessThanOrEqual(2 + 1e-9);
        }
      }
    }
  });

  it('alpha never exceeds the kind peak and never goes negative', () => {
    for (const kind of KINDS) {
      const peak = META[kind].peak;
      for (let t = 0; t < 8; t += 0.29) {
        for (const ring of effectRings(kind, t)) {
          expect(ring.alpha).toBeGreaterThanOrEqual(0);
          expect(ring.alpha).toBeLessThanOrEqual(peak + 1e-9);
        }
      }
    }
  });

  it('glow pulses softly while impact decays to near-zero within its cycle', () => {
    const sample = (kind: EffectKind, steps = 64): number[] => {
      const out: number[] = [];
      for (let i = 0; i < steps; i++) {
        for (const r of effectRings(kind, (i / steps) * META[kind].cycle)) {
          out.push(r.alpha);
        }
      }
      return out;
    };
    const glowMin = Math.min(...sample('glow'));
    const impactMin = Math.min(...sample('impact'));
    // Glow keeps a high base alpha all cycle; impact fades fully out.
    expect(glowMin).toBeGreaterThan(META.glow.peak * 0.7);
    expect(impactMin).toBeLessThan(0.01);
  });

  it('ring count follows each kind’s configured phase offsets', () => {
    expect(effectRings('smoke', 0)).toHaveLength(2); // offsets [0, 0.5]
    expect(effectRings('dust', 0)).toHaveLength(2);
    expect(effectRings('impact', 0)).toHaveLength(2);
    expect(effectRings('fire', 0)).toHaveLength(2);
    expect(effectRings('glow', 0)).toHaveLength(1);
  });
});

describe('effects (battle FX instances, §BATTLE FX)', () => {
  it('every kind has a positive burst duration and base radius', () => {
    for (const kind of KINDS) {
      expect(BURST_DURATION[kind]).toBeGreaterThan(0);
    }
    expect(INSTANCE_BASE_RADIUS).toBeGreaterThan(0);
  });

  it('instanceActive respects the window boundaries', () => {
    expect(instanceActive(0.5, 0.5, 0.6)).toBe(true);
    expect(instanceActive(1.1, 0.5, 0.6)).toBe(true);
    expect(instanceActive(0.49, 0.5, 0.6)).toBe(false); // before start
    expect(instanceActive(1.1001, 0.5, 0.6)).toBe(false); // after end
  });

  it('effectBurst is deterministic and fades to silence at/beyond duration', () => {
    for (const kind of KINDS) {
      const d = BURST_DURATION[kind];
      expect(effectBurst(kind, 0.3, d)).toEqual(effectBurst(kind, 0.3, d));
      for (const ring of effectBurst(kind, d, d)) {
        expect(ring.alpha).toBeLessThanOrEqual(1e-9);
      }
      for (const ring of effectBurst(kind, d + 1, d)) {
        expect(ring.alpha).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('effectBurst alpha never exceeds the ring math peak', () => {
    for (const kind of KINDS) {
      const d = BURST_DURATION[kind];
      for (let i = 0; i < 64; i++) {
        const t = (i / 64) * d;
        const burst = effectBurst(kind, t, d);
        const raw = effectRings(kind, t);
        expect(burst).toHaveLength(raw.length);
        for (let j = 0; j < burst.length; j++) {
          expect(burst[j].alpha).toBeLessThanOrEqual(raw[j].alpha + 1e-9);
          expect(burst[j].radiusFactor).toBeCloseTo(raw[j].radiusFactor, 6);
        }
      }
    }
  });
});
