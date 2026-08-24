import { describe, it, expect } from 'vitest';
import {
  ARROW_STYLES,
  DEFAULT_ARROW_STYLE,
  arrowStyleSpec,
} from './arrowStyles';
import type { ArrowStyle } from '../scene/types';

describe('ARROW_STYLES (PRD §32)', () => {
  it("'attack' reproduces the pre-branding geometry exactly", () => {
    expect(ARROW_STYLES.attack).toEqual({
      shaftWidth: 6,
      headLength: 18,
      headHalfWidth: 11,
      opacity: 1,
    });
    // Legacy look is SOLID — no dash key at all so saves stay byte-stable.
    expect('dash' in ARROW_STYLES.attack).toBe(false);
  });

  it('covers every style in the ArrowStyle union with a complete spec', () => {
    const styles: ArrowStyle[] = [
      'attack',
      'movement',
      'flank',
      'retreat',
      'encirclement',
      'charge',
    ];
    for (const style of styles) {
      const spec = ARROW_STYLES[style];
      expect(spec).toBeDefined();
      expect(spec.shaftWidth).toBeGreaterThan(0);
      expect(spec.headLength).toBeGreaterThan(0);
      expect(spec.headHalfWidth).toBeGreaterThan(0);
      expect(spec.opacity).toBeGreaterThan(0);
      expect(spec.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('distinguishes the styles by geometry/opacity/dash rhythm', () => {
    const widths = Object.values(ARROW_STYLES).map((s) => s.shaftWidth);
    expect(new Set(widths).size).toBeGreaterThan(2); // not all the same weight
    // Dashed styles carry an explicit dash pattern; solid ones do not.
    expect(ARROW_STYLES.movement.dash).toEqual([12, 8]);
    expect(ARROW_STYLES.retreat.dash).toEqual([6, 6]);
    expect(ARROW_STYLES.encirclement.dash).toEqual([2, 7]);
    expect(ARROW_STYLES.flank.dash).toBeUndefined();
    expect(ARROW_STYLES.charge.dash).toBeUndefined();
  });
});

describe('arrowStyleSpec', () => {
  it('falls back to the default style for absent tags', () => {
    expect(DEFAULT_ARROW_STYLE).toBe('attack');
    expect(arrowStyleSpec(undefined)).toBe(ARROW_STYLES.attack);
  });

  it('is a total function over the union', () => {
    for (const style of Object.keys(ARROW_STYLES) as ArrowStyle[]) {
      expect(arrowStyleSpec(style)).toBe(ARROW_STYLES[style]);
    }
  });

  it('returns the SAME object reference per style (pure lookup, no copies)', () => {
    expect(arrowStyleSpec('charge')).toBe(arrowStyleSpec('charge'));
  });
});
