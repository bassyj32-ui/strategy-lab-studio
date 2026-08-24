import { describe, it, expect } from 'vitest';
import { effectRings, effectColor, META } from './effects';
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
