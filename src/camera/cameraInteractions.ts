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
 */
export function wheelDeltaToFactor(
  deltaY: number,
  sensitivity = 0.0015,
): number {
  return Math.exp(-deltaY * sensitivity);
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
