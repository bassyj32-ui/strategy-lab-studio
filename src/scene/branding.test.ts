import { describe, it, expect } from 'vitest';
import {
  TYPOGRAPHY,
  BRAND_ACCENT,
  DEFAULT_CARD_KICKER,
  DEFAULT_CLOSING_TITLE,
  CARD_DEFAULT_DURATION,
  resolveFactionColors,
  openingCardWindow,
  closingCardWindow,
  cardAlpha,
} from './branding';
import { FACTION_COLORS } from '../objects/annotations';
import type { BrandConfig } from './types';

describe('§93 brand tokens', () => {
  it('exposes the display/primary typography pair', () => {
    expect(TYPOGRAPHY.display).toContain('serif');
    expect(TYPOGRAPHY.primary).toContain('sans-serif');
  });

  it('uses the Signals Console amber accent + default card copy', () => {
    expect(BRAND_ACCENT).toBe('#f5a83c');
    expect(DEFAULT_CARD_KICKER).toBe('STRATEGY LAB');
    expect(DEFAULT_CLOSING_TITLE).toBe('THE LESSON');
    expect(CARD_DEFAULT_DURATION).toBe(3);
  });
});

describe('resolveFactionColors', () => {
  it('falls back to the canonical §31 palette without a brand', () => {
    expect(resolveFactionColors(undefined)).toEqual(FACTION_COLORS);
    expect(resolveFactionColors({})).toEqual(FACTION_COLORS);
  });

  it('merges per-scene overrides over the defaults (pure, no mutation)', () => {
    const brand: BrandConfig = {
      factionColors: { red: '#123456' },
    };
    const resolved = resolveFactionColors(brand);
    expect(resolved.red).toBe('#123456');
    // Untouched factions keep the canonical color.
    expect(resolved.blue).toBe(FACTION_COLORS.blue);
    expect(brand.factionColors).toEqual({ red: '#123456' });
  });
});

describe('card windows (PRD §95/§96 timing)', () => {
  it('opening card starts at 0 with the default duration', () => {
    expect(openingCardWindow(undefined)).toEqual({ startAt: 0, duration: 3 });
    expect(openingCardWindow({})).toEqual({ startAt: 0, duration: 3 });
  });

  it('closing card hugs the END of the timeline by default', () => {
    expect(closingCardWindow(undefined, 10)).toEqual({
      startAt: 7,
      duration: 3,
    });
    // Short timelines clamp at 0 rather than going negative.
    expect(closingCardWindow({}, 2)).toEqual({ startAt: 0, duration: 3 });
  });

  it('explicit configs win and are clamped to sane values', () => {
    expect(openingCardWindow({ startAt: -5, duration: 0 })).toEqual({
      startAt: 0,
      duration: 0.1,
    });
    expect(closingCardWindow({ startAt: 4, duration: 1.5 }, 10)).toEqual({
      startAt: 4,
      duration: 1.5,
    });
  });
});

describe('cardAlpha fade envelope', () => {
  const win = { startAt: 2, duration: 4 }; // fades: 0.8s in / 0.8s out

  it('is 0 outside the window (including exactly at the end)', () => {
    expect(cardAlpha(0, win)).toBe(0);
    expect(cardAlpha(1.99, win)).toBe(0);
    expect(cardAlpha(6, win)).toBe(0);
    expect(cardAlpha(100, win)).toBe(0);
  });

  it('holds fully visible through the middle', () => {
    expect(cardAlpha(2.8, win)).toBeCloseTo(1, 12);
    expect(cardAlpha(4, win)).toBe(1);
    expect(cardAlpha(5.2, win)).toBeCloseTo(1, 12);
  });

  it('fades in over the first 20% and out over the last 20%', () => {
    expect(cardAlpha(2, win)).toBeCloseTo(0); // first frame of rise
    expect(cardAlpha(2.4, win)).toBeCloseTo(0.5); // half-way up
    expect(cardAlpha(5.6, win)).toBeCloseTo(0.5); // half-way down
    expect(cardAlpha(5.99, win)).toBeGreaterThan(0);
    expect(cardAlpha(5.99, win)).toBeLessThan(1);
  });

  it('never escapes [0, 1] and is deterministic per frame', () => {
    for (let t = 0; t <= 8; t += 0.05) {
      const a = cardAlpha(t, win);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(a).toBe(cardAlpha(t, win));
    }
  });

  it('handles degenerate tiny windows without NaN or division by zero', () => {
    const micro = { startAt: 0, duration: 0.1 };
    for (let t = 0; t <= 0.15; t += 0.01) {
      expect(Number.isNaN(cardAlpha(t, micro))).toBe(false);
    }
  });
});
