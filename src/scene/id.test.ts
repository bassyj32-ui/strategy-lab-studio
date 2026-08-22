import { describe, it, expect } from 'vitest';
import { createId } from './id';

describe('createId', () => {
  it('produces unique ids across many rapid calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 2000; i++) ids.add(createId('shape'));
    expect(ids.size).toBe(2000);
  });

  it('prefixes the type', () => {
    expect(createId('marker').startsWith('marker-')).toBe(true);
    expect(createId('layer').startsWith('layer-')).toBe(true);
  });

  it('never returns an empty string', () => {
    for (let i = 0; i < 100; i++) {
      expect(createId('shape').length).toBeGreaterThan(0);
    }
  });
});
