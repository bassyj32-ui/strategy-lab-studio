// Light interaction helpers for camera pan/zoom. These are intentionally
// Konva-free: the caller extracts pointer positions and feeds them in, so the
// same helpers work with konva, plain DOM, or tests.

import { useRef } from 'react';
import type { Vec2 } from '../scene/types';

/**
 * Map a mouse-wheel `deltaY` to a zoom factor.
 *   deltaY < 0 (scroll up)   -> factor > 1 -> zoom in
 *   deltaY = 0               -> factor = 1
 *   deltaY > 0 (scroll down) -> factor < 1 -> zoom out
 *
 * IMPORTANT: `deltaY` must already be in PIXELS — run it through
 * `normalizeWheelDelta` first (Firefox reports LINE units, which would make
 * zoom imperceptible with pixel-tuned sensitivity).
 */
export function wheelDeltaToFactor(
  deltaY: number,
  sensitivity = 0.0015,
): number {
  return Math.exp(-deltaY * sensitivity);
}

// WheelEvent.deltaMode values (WHATWG spec).
export const DELTA_PIXEL = 0;
export const DELTA_LINE = 1;
export const DELTA_PAGE = 2;

/** Standard CSS line height assumed for line-mode wheel deltas. */
export const LINE_HEIGHT_PX = 16;
/** Fallback page height for the rare page-mode wheel deltas. */
export const PAGE_HEIGHT_PX = 400;

/**
 * Normalize a wheel `deltaY` to PIXELS regardless of the browser's
 * `deltaMode`. Chrome/Safari already report pixels; Firefox reports LINES
 * (~±3 per notch) and very rarely PAGES. Without this, Firefox zoom moved
 * ~0.45% per notch — effectively broken.
 */
export function normalizeWheelDelta(
  deltaY: number,
  deltaMode: number = DELTA_PIXEL,
): number {
  if (deltaMode === DELTA_LINE) return deltaY * LINE_HEIGHT_PX;
  if (deltaMode === DELTA_PAGE) return deltaY * PAGE_HEIGHT_PX;
  return deltaY;
}

/**
 * Map a viewport (clientX/Y) coordinate to logical STAGE pixel space.
 *
 * Ratio-based so it stays correct under any CSS scale applied to the stage's
 * container: getBoundingClientRect returns the VISUALLY scaled size while
 * stage.width()/height() are the unscaled logical sizes. This is the exact
 * conversion the canvas drop handler needs before screenToWorld, so objects
 * land under the cursor at any pan/zoom.
 */
export function clientToStagePoint(
  rect: { left: number; top: number; width: number; height: number },
  stageWidth: number,
  stageHeight: number,
  clientX: number,
  clientY: number,
): Vec2 {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const sx = stageWidth / rect.width;
  const sy = stageHeight / rect.height;
  return {
    x: (clientX - rect.left) * sx,
    y: (clientY - rect.top) * sy,
  };
}

export interface CameraPanHandlers {
  onPointerDown: () => void;
  onPointerMove: () => void;
  onPointerUp: () => void;
}

export interface UseCameraPanOptions {
  /** Returns the current pointer position in screen space, or null. */
  getPointer: () => Vec2 | null;
  /** Called with the screen-space delta since the last move while dragging. */
  onPan: (dx: number, dy: number) => void;
}

/**
 * Pure drag bookkeeping for panning. Remembers the last pointer position
 * between moves and reports the per-move delta to `onPan`. All pointer
 * extraction is the caller's job (Konva, DOM, etc.).
 */
export function useCameraPan(opts: UseCameraPanOptions): CameraPanHandlers {
  const last = useRef<Vec2 | null>(null);

  return {
    onPointerDown: () => {
      last.current = opts.getPointer();
    },
    onPointerMove: () => {
      const cur = opts.getPointer();
      if (!cur || !last.current) return;
      const dx = cur.x - last.current.x;
      const dy = cur.y - last.current.y;
      last.current = cur;
      opts.onPan(dx, dy);
    },
    onPointerUp: () => {
      last.current = null;
    },
  };
}
