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

// ---------------------------------------------------------------------------
// §BATTLE FX (P0 extension) — one-shot INSTANCE bursts. Same deterministic
// ring math above, windowed to a finite lifetime so a burst spawns, expands,
// fades and is gone instead of looping forever.
// ---------------------------------------------------------------------------

/** World-space radius multiplier origin for an instance's rings (both doors). */
export const INSTANCE_BASE_RADIUS = 64;

/** Default per-kind burst lifetime (seconds) used by the Battle FX trigger. */
export const BURST_DURATION: Record<EffectKind, number> = {
  smoke: 1.8,
  dust: 1.2,
  impact: 0.6,
  fire: 0.8,
  glow: 0.9,
};

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** True while an instance is visible: inside its [startTime, start+duration] window. */
export function instanceActive(
  t: number,
  startTime: number,
  duration: number
): boolean {
  return t >= startTime && t <= startTime + Math.max(duration, 1e-6);
}

/**
 * Burst ring data at a LOCAL time inside the instance's lifetime
 * (localTime = t - startTime). Wraps effectRings and scales alpha by an
 * in-out envelope (fade in over the first 20%, hold, fade out over the last
 * 40%). At localTime >= duration the envelope is 0, so one-shot bursts never
 * loop. Pure (kind, localTime, duration) math — identical in both doors.
 */
export function effectBurst(
  kind: EffectKind,
  localTime: number,
  duration: number
): EffectRing[] {
  const life = Math.max(duration, 1e-6);
  const p = clamp01(localTime / life);
  const envelope =
    p < 0.2 ? p / 0.2 : p > 0.6 ? Math.max(0, 1 - (p - 0.6) / 0.4) : 1;
  return effectRings(kind, localTime).map((ring) => ({
    radiusFactor: ring.radiusFactor,
    alpha: ring.alpha * envelope,
  }));
}
