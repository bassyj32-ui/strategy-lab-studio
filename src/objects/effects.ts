// §50 EFFECT SYSTEM (P2) — pure deterministic effect math. NO React / Konva /
// canvas imports: both render doors (draw.ts and ObjectNode.tsx) consume the
// SAME ring data so editor preview and Remotion export stay visually identical
// (architecture Law 1). Everything is a function of (kind, time) — never of
// randomness — preserving byte-deterministic exports.
import type { EffectKind } from '../scene/types';

interface EffectMeta {
  color: string;
  /** Seconds per expansion cycle. */
  cycle: number;
  /** Phase offsets (0..1 of a cycle) for each concentric ring. */
  rings: number[];
  /** Maximum ring alpha — kept restrained (§50: tactical clarity first). */
  peak: number;
}

/** Per-kind look parameters. Exported for tests + a future UI legend. */
export const META: Record<EffectKind, EffectMeta> = {
  smoke: { color: '#9ca3af', cycle: 3, rings: [0, 0.5], peak: 0.3 },
  dust: { color: '#c9b48a', cycle: 2, rings: [0, 0.4], peak: 0.28 },
  impact: { color: '#f5a83c', cycle: 0.6, rings: [0, 0.25], peak: 0.6 },
  fire: { color: '#ef6a2a', cycle: 0.8, rings: [0, 0.33], peak: 0.55 },
  glow: { color: '#f5a83c', cycle: 2.4, rings: [0], peak: 0.22 },
};

export function effectColor(kind: EffectKind): string {
  return META[kind].color;
}

export interface EffectRing {
  /** Halo radius as a multiple of the object's annotation ring radius. */
  radiusFactor: number;
  /** 0..1 — multiply by the object's opacity when painting. */
  alpha: number;
}

/**
 * Concentric halo rings at `time` (seconds). Rings expand from just outside
 * the object and fade out; `glow` instead breathes gently in place. Smooth
 * cos-based phase → stable across frames and identical in both doors.
 */
export function effectRings(kind: EffectKind, time: number): EffectRing[] {
  const m = META[kind];
  return m.rings.map((off) => {
    const phase =
      ((((time + off * m.cycle) % m.cycle) + m.cycle) % m.cycle) / m.cycle;
    // wobble sweeps 0 → 1 → 0 once per cycle.
    const wobble = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
    return {
      radiusFactor: 1.15 + 0.85 * wobble,
      alpha:
        kind === 'glow'
          ? m.peak * (0.75 + 0.25 * wobble)
          : m.peak * (1 - wobble),
    };
  });
}
