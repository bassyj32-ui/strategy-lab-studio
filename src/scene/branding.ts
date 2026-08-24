// Pure §93 BRANDING constants + §95/§96 title-card timing math shared by BOTH
// render doors (Remotion draw.ts and any preview consumer of drawScene) so the
// cards are pixel-faithful and deterministic (architecture Law 1). No
// React/Konva/canvas imports — testable constants + pure envelope only.
import type { BrandConfig, Faction } from './types';
import { FACTION_COLORS } from '../objects/annotations';

/**
 * §93 typography tokens. Display = serif for the historical title-card feel
 * (§95); primary = UI sans used for kickers/subtitles/labels.
 */
export const TYPOGRAPHY = {
  display: 'Georgia, "Times New Roman", serif',
  primary: 'system-ui, sans-serif',
} as const;

/** Brand accent (kicker rule + kicker text) — Signals Console amber. */
export const BRAND_ACCENT = '#f5a83c';

/** Default card text when neither the card config nor brand provides one. */
export const DEFAULT_CARD_KICKER = 'STRATEGY LAB';
export const DEFAULT_CLOSING_TITLE = 'THE LESSON';

/** Card window defaults (seconds). */
export const CARD_DEFAULT_DURATION = 3;

/**
 * Faction color palette with per-scene §31 overrides applied. Pure: never
 * mutates `brand`; unknown/absent fields fall back to the canonical colors.
 */
export function resolveFactionColors(
  brand?: BrandConfig
): Record<Faction, string> {
  return { ...FACTION_COLORS, ...(brand?.factionColors ?? {}) };
}

/** Resolved card window [startAt, duration] in SECONDS. */
export interface CardWindow {
  startAt: number;
  duration: number;
}

/** Opening default: starts at 0. */
export function openingCardWindow(
  cfg: { startAt?: number; duration?: number } | undefined
): CardWindow {
  return {
    startAt: Math.max(0, cfg?.startAt ?? 0),
    duration: Math.max(0.1, cfg?.duration ?? CARD_DEFAULT_DURATION),
  };
}

/** Closing default: hugs the END of the scene's timeline. */
export function closingCardWindow(
  cfg: { startAt?: number; duration?: number } | undefined,
  timelineDuration: number
): CardWindow {
  const duration = Math.max(0.1, cfg?.duration ?? CARD_DEFAULT_DURATION);
  return {
    startAt: cfg?.startAt ?? Math.max(0, timelineDuration - duration),
    duration,
  };
}

/**
 * Deterministic fade envelope for a title card at time `t` (seconds):
 * 20% fade-in, hold, 20% fade-out, clamped to [0, 1]. Pure function of time —
 * no randomness — so a given frame always paints identically (Law of exports).
 */
export function cardAlpha(t: number, win: CardWindow): number {
  if (t < win.startAt || t >= win.startAt + win.duration) return 0;
  const local = t - win.startAt;
  const fadeIn = win.duration * 0.2;
  const fadeOut = win.duration * 0.2;
  const rise = fadeIn > 0 ? Math.min(1, local / fadeIn) : 1;
  const fall =
    fadeOut > 0 ? Math.min(1, (win.duration - local) / fadeOut) : 1;
  return Math.max(0, Math.min(rise, fall));
}
