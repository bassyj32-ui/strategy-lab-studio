import { useRef, useState } from 'react';
import type { MouseEvent as MouseEventLike } from 'react';
import type { Transform, SceneObject, CameraState } from '../scene/types';
import type { Viewport } from '../camera/cameraMath';
import { worldToScreen } from '../camera/cameraMath';
import { useSceneStore } from '../scene/store';
import {
  scrubValue,
  normalizeDeg,
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

interface HudProps {
  obj: SceneObject;
  worldT: Transform;
  displayCamera: CameraState;
  vp: Viewport;
  displayScale: number;
  wrapWidth: number;
}

export function SelectionHud({
  obj,
  worldT,
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

  const apply = (partial: Partial<Transform>): void =>
    updateTransform(obj.id, partial);

  // Anchor on screen (CSS px inside .canvas-wrap), clamped to stay visible.
  // Sits ABOVE the rotation stalk (+24px clearance) so it never covers the
  // object it edits — the old version floated on top of the selection.
  const sp = worldToScreen({ x: worldT.x, y: worldT.y }, displayCamera, vp);
  const left = Math.min(Math.max(sp.x * displayScale, 150), Math.max(wrapWidth - 150, 150));
  const top = Math.max(sp.y * displayScale - 64, 34);

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
        format={(v) => `${Math.round(v)}`}
        onBegin={beginGesture}
        onEnd={endInteraction}
        onScrubPx={(dx, _dy, fine) =>
          apply({ x: scrubValue(baseRef.current.x, dx, 1, fine) })
        }
        onCommit={(v) => apply({ x: v })}
      />
      <ScrubField
        label="Y"
        value={obj.transform.y}
        format={(v) => `${Math.round(v)}`}
        onBegin={beginGesture}
        onEnd={endInteraction}
        onScrubPx={(dx, _dy, fine) =>
          apply({ y: scrubValue(baseRef.current.y, dx, 1, fine) })
        }
        onCommit={(v) => apply({ y: v })}
      />
      <ScrubField
        label="SCL"
        value={obj.transform.scale}
        format={(v) => `${Math.round(v * 100)}%`}
        onBegin={beginGesture}
        onEnd={endInteraction}
        onScrubPx={(dx, _dy, fine) =>
          apply({
            scale: Math.min(
              20,
              Math.max(0.05, scrubValue(baseRef.current.scale, dx, 0.005, fine))
            ),
          })
        }
        onCommit={(v) => apply({ scale: Math.min(20, Math.max(0.05, v)) })}
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
              scrubValue(baseRef.current.rotation, dx, 0.25, fine)
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
        <input
          className="hud-input"
          data-testid={`hud-input-${label}`}
          aria-label={label}
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
      aria-label={label}
      onMouseDown={handleMouseDown}
      title={`${label} · drag to change · Shift = fine · Click to type`}
    >
      <span className="scrub-value">{format(value)}</span>
    </span>
  );
}
