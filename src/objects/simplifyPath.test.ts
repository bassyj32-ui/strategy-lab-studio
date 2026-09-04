import { describe, it, expect } from 'vitest';
import { simplifyPath } from './simplifyPath';

describe('simplifyPath', () => {
  it('returns empty array for empty input', () => {
    expect(simplifyPath([], 10)).toEqual([]);
  });

  it('returns single point unchanged', () => {
    expect(simplifyPath([{ x: 5, y: 5 }], 10)).toEqual([{ x: 5, y: 5 }]);
  });

  it('returns both points for two-point input', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    expect(simplifyPath(pts, 10)).toEqual(pts);
  });

  it('simplifies a straight line to just endpoints', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 40, y: 0 },
      { x: 50, y: 0 },
    ];
    const result = simplifyPath(pts, 5);
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }]);
  });

  it('preserves a sharp corner', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 }, // corner
      { x: 30, y: 60 },
      { x: 30, y: 90 },
    ];
    const result = simplifyPath(pts, 5);
    // Should keep at least 3 points (start, corner area, end)
    expect(result.length).toBeGreaterThanOrEqual(3);
    // The result should have points in both horizontal and vertical directions
    const hasHorizontal = result.some((p) => p.y === 0);
    const hasVertical = result.some((p) => p.x === 30);
    expect(hasHorizontal).toBe(true);
    expect(hasVertical).toBe(true);
  });

  it('simplifies a gentle curve to fewer points', () => {
    // Create a smooth arc (quarter circle)
    const pts = Array.from({ length: 20 }, (_, i) => {
      const angle = (i / 19) * (Math.PI / 2);
      return { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 };
    });
    const result = simplifyPath(pts, 15);
    expect(result.length).toBeLessThan(pts.length);
    expect(result.length).toBeGreaterThanOrEqual(2);
    // First and last preserved
    expect(result[0]).toEqual(pts[0]);
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('smaller epsilon preserves more points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 3 },
      { x: 10, y: 0 },
      { x: 15, y: -3 },
      { x: 20, y: 0 },
      { x: 25, y: 3 },
      { x: 30, y: 0 },
    ];
    const loose = simplifyPath(pts, 10);
    const tight = simplifyPath(pts, 1);
    expect(tight.length).toBeGreaterThanOrEqual(loose.length);
  });
});
