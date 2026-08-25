import { useRef, useState } from 'react';
import type { MouseEvent as MouseEventLike } from 'react';
import type { Transform, SceneObject, CameraState } from '../scene/types';
import type { Viewport } from '../camera/cameraMath';
import { worldToScreen } from '../camera/cameraMath';
import { useSceneStore } from '../scene/store';
import { worldPointToLocal } from '../objects/groups';
import {
  scrubValue,
  localDeltaForWorldDelta,
  normalizeDeg,
  clampScale,
} from '../canvas/gizmo';

/**
 * Floating transform HUD rendered NEXT TO the selected object on the canvas
 * (Wave-3 UX). Values are the object's LOCAL transform — the same numbers the
 * Inspector edits — but scrubbing happens where the user is already looking.
 *
 * Per field: grab + drag horizontally to change (Shift = 10× finer); plain
 * CLICK opens an inline input (Enter/blur commits, Escape cancels). Each
 * gesture is ONE undo session via the existing begin/endInteraction contract.
 * Reads/writes ONLY existing store actions — no store changes.
 */

const IDENTITY_FRAME: Transform = {
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  opacity: 1,
};

interface HudProps {
  obj: SceneObject;
  worldT: Transform;
  parentFrame: Transform | null;
  displayCamera: CameraState;
  vp: Viewport;
  displayScale: number;
  wrapWidth: number;
}

export function SelectionHud({
  obj,
  worldT,
  parentFrame,
  displayCamera,
  vp,
  displayScale,
  wrapWidth,
}: HudProps) {
  const beginInteraction = useSceneStore((s) => s.beginInteraction);
  const endInteraction = useSceneStore((s) => s.endInteraction);
  const updateTransform = useSceneStore((s) => s.updateTransform);
  // UX repair pass: one-click duplicate of the selected object (new
  // independent id, sprite/transform/keyframes copied, ONE undo step).
  const duplicateObject = useSceneStore((s) => s.duplicateObject);

  // Values frozen at gesture start — drags are ABSOLUTE from this base so
  // repeated mousemove events never compound (each event recomputes
  // start + total delta).
  const baseRef = useRef<Transform>(obj.transform);
  const beginGesture = (): void => {
    baseRef.current = obj.transform;
    beginInteraction();
  };

  /** World px delta → parent-frame local delta (roots: identity). */
  const mapDelta = (dxCss: number, dyCss: number, fine: boolean) => {
    const k =
      (fine ? 0.1 : 1) /
      Math.max(displayCamera.zoom, 0.0001) /
      Math.max(displayScale, 0.0001);
    return localDeltaForWorldDelta(
      (wx: number, wy: number) =>
        worldPointToLocal(parentFrame ?? IDENTITY_FRAME, wx, wy),
      dxCss * k,
      dyCss * k
    );
  };

  const apply = (partial: Partial<Transform>): void =>
    updateTransform(obj.id, partial);

  // Anchor on screen (CSS px inside .canvas-wrap), clamped to stay visible.
  const sp = worldToScreen({ x: worldT.x, y: worldT.y }, displayCamera, vp);
  const left = Math.min(Math.max(sp.x * displayScale, 110), Math.max(wrapWidth - 110, 110));
  const top = Math.max(sp.y * displayScale - 16, 34);

  return (
    <div
      className="sel-hud"
      data-testid="selection-hud"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ScrubField
        label="X"
        value={obj.transform.x}
        format={(v) => String(Math.round(v))}
        onBegin={beginGesture}
        onEnd={endInteraction}
        onScrubPx={(dx, dy, fine) =>
          apply({ x: baseRef.current.x + mapDelta(dx, dy, fine).x })
        }
        onCommit={(v) => apply({ x: v })}
      />
      <ScrubField
        label="Y"
        value={obj.transform.y}
        format={(v) => String(Math.round(v))}
        onBegin={beginGesture}
        onEnd={endInteraction}
        onScrubPx={(dx, dy, fine) =>
          apply({ y: baseRef.current.y + mapDelta(dx, dy, fine).y })
        }
        onCommit={(v) => apply({ y: v })}
      />
      <ScrubField
        label="SCL"
        value={obj.transform.scale}
        format={(v) => `${v.toFixed(2)}×`}
        onBegin={beginGesture}
        onEnd={endInteraction}
        onScrubPx={(dx, _dy, fine) =>
          apply({
            scale: clampScale(scrubValue(baseRef.current.scale, dx, 0.01, fine)),
          })
        }
        onCommit={(v) => apply({ scale: clampScale(v) })}
      />
      <ScrubField
        label="ROT"
        value={obj.transform.rotation}
        format={(v) => `${Math.round(normalizeDeg(v))}°`}
        onBegin={beginGesture}
        onEnd={endInteraction}
        onScrubPx={(dx, _dy, fine) =>
          apply({
            rotation: normalizeDeg(
              scrubValue(baseRef.current.rotation, dx, 0.5, fine)
            ),
          })
        }
        onCommit={(v) => apply({ rotation: normalizeDeg(v) })}
      />
      <button
        type="button"
        className="hud-duplicate"
        data-testid="hud-duplicate"
        title="Duplicate object (⌘D) — copies sprite, pose, keyframes and group membership"
        onClick={() => duplicateObject(obj.id)}
      >
        Duplicate
      </button>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: number;
  format: (v: number) => string;
  onBegin: () => void;
  onEnd: () => void;
  onScrubPx: (dxPx: number, dyPx: number, fine: boolean) => void;
  onCommit: (v: number) => void;
}

function ScrubField({
  label,
  value,
  format,
  onBegin,
  onEnd,
  onScrubPx,
  onCommit,
}: FieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function commit(): void {
    const v = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(v)) {
      // A typed commit is its own single undo step.
      onBegin();
      onCommit(v);
      onEnd();
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="scrub-field editing">
        <span className="scrub-label">{label}</span>
        <input
          className="hud-input"
          data-testid={`hud-input-${label}`}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
            else if (e.key === 'Enter') commit();
          }}
          onBlur={commit}
        />
      </span>
    );
  }

  const handleMouseDown = (e: MouseEventLike): void => {
    e.preventDefault();
    e.stopPropagation();
    let moved = false;
    const startX = e.clientX;
    const startY = e.clientY;
    onBegin();
    const move = (ev: MouseEvent): void => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      onScrubPx(dx, dy, ev.shiftKey);
    };
    const up = (): void => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      onEnd();
      if (!moved) {
        setDraft(String(Math.round(value * 100) / 100));
        setEditing(true);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <span
      className="scrub-field"
      data-testid={`hud-scrub-${label}`}
      onMouseDown={handleMouseDown}
      title="Drag to change · Shift = fine · Click to type"
    >
      <span className="scrub-label">{label}</span>
      <span className="scrub-value">{format(value)}</span>
    </span>
  );
}
