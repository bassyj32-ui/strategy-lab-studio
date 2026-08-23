// CameraHud — makes the world-space camera VISIBLE and operable.
//
// A small overlay pinned to the canvas corner: a live zoom % readout plus
// Zoom In / Zoom Out / Reset View. All three buttons route through the SAME
// clamped camera math as wheel-zoom (zoomAtPoint via CanvasStage's useCamera
// binding) — no second implementation of zoom, MIN/MAX stay [0.1, 8].
//
// Also hosts the dismissible one-line gesture hint chip.
//
// Accessibility: native <button>s are focusable and fire on Enter/Space;
// every control carries an aria-label; the readout is announced text.

import { useState } from 'react';
import type { WheelEvent as ReactWheelEvent } from 'react';
import { useSceneStore } from '../scene/store';
import { MIN_ZOOM, MAX_ZOOM } from '../camera';

export interface CameraHudProps {
  /** Zoom in by one fixed step around the viewport centre (clamped). */
  onZoomIn: () => void;
  /** Zoom out by one fixed step around the viewport centre (clamped). */
  onZoomOut: () => void;
  /** Restore the default view (world origin centred, 100% zoom). */
  onResetView: () => void;
}

const HINT_STORAGE_KEY = 'sls.camera-hint-dismissed';

/** localStorage may be unavailable (privacy modes / tests) — degrade quietly. */
function readHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(HINT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHintDismissed(): void {
  try {
    window.localStorage.setItem(HINT_STORAGE_KEY, '1');
  } catch {
    // Non-fatal: the chip just reappears next session.
  }
}

export function CameraHud({ onZoomIn, onZoomOut, onResetView }: CameraHudProps) {
  // Single source of truth: the zoom lives in Scene.camera (PRD §87).
  const zoom = useSceneStore((s) => s.scene.camera.zoom);
  const [hintDismissed, setHintDismissed] = useState(readHintDismissed);

  // At the clamp bounds exactly, disable the corresponding button so keyboard
  // users get the same feedback as wheel users (zoom simply stops).
  const atMax = zoom >= MAX_ZOOM;
  const atMin = zoom <= MIN_ZOOM;

  const dismissHint = (): void => {
    setHintDismissed(true);
    writeHintDismissed();
  };

  // The HUD floats over the canvas: swallow wheel events so hovering it never
  // scrolls the page or double-fires canvas gestures.
  const swallowWheel = (e: ReactWheelEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      {!hintDismissed && (
        <div className="camera-hud-chip" role="note" aria-label="Canvas navigation hint">
          <span>Scroll = zoom · Drag background = pan</span>
          <button
            type="button"
            className="camera-hud-chip-close"
            aria-label="Dismiss canvas navigation hint"
            onClick={dismissHint}
          >
            ×
          </button>
        </div>
      )}

      <div
        className="camera-hud"
        role="group"
        aria-label="Camera view controls"
        onWheel={swallowWheel}
      >
        <button
          type="button"
          className="camera-hud-btn"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={atMin}
          onClick={onZoomOut}
        >
          −
        </button>
        <span
          className="camera-hud-zoom"
          aria-label={`Current zoom ${Math.round(zoom * 100)} percent`}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="camera-hud-btn"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={atMax}
          onClick={onZoomIn}
        >
          +
        </button>
        <span className="camera-hud-sep" aria-hidden="true" />
        <button
          type="button"
          className="camera-hud-btn camera-hud-btn-reset"
          aria-label="Reset view to default"
          title="Reset view (double-click empty canvas)"
          onClick={onResetView}
        >
          Reset
        </button>
      </div>
    </>
  );
}

export default CameraHud;
