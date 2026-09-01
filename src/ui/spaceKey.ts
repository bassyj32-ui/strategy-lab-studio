import { isTypingTarget } from './shortcuts';

/**
 * Global Space-key hold tracking for canvas gestures. Fixed at module level
 * (not per-component) so keydown/keyup across re-renders stay consistent,
 * and the canvas can query `isSpaceDown()` to decide pan vs marquee.
 * Attach once via `bindSpaceHold()` (idempotent listeners are guard-based).
 */

let spaceDown = false;
let bound = false;

export function isSpaceDown(): boolean {
  return spaceDown;
}

const onDown = (e: KeyboardEvent) => {
  if (e.code !== 'Space') return;
  if (isTypingTarget(e.target)) return;
  spaceDown = true;
  // Keep the Space+drag pan alive even when focus moves mid-drag; also stop
  // Space activating a focused button after the gesture ends.
  e.preventDefault();
  e.stopPropagation();
};

const onUp = (e: KeyboardEvent) => {
  if (e.code !== 'Space') return;
  spaceDown = false;
};

const onBlur = () => {
  spaceDown = false;
};

export function bindSpaceHold(): void {
  if (bound) return;
  bound = true;
  window.addEventListener('keydown', onDown, { capture: true });
  window.addEventListener('keyup', onUp, { capture: true });
  window.addEventListener('blur', onBlur);
}

/** Reset listeners + state (tests / HMR). */
export function unbindSpaceHold(): void {
  if (!bound) return;
  bound = false;
  window.removeEventListener('keydown', onDown, { capture: true });
  window.removeEventListener('keyup', onUp, { capture: true });
  window.removeEventListener('blur', onBlur);
  spaceDown = false;
}