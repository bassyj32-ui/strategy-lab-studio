import { useEffect, useState } from 'react';
import type { SceneObject, Transform } from '../scene/types';
import { useSceneStore } from '../scene/store';
import { selectedObject } from '../scene/selectors';
import { DEFAULT_ARROW_LENGTH, DEFAULT_ARROW_COLOR } from '../objects/factory';
import { nextZAbove, nextZBelow } from '../objects/depth';

interface FieldDef {
  key: keyof Transform;
  label: string;
  step: number;
}

const FIELDS: FieldDef[] = [
  { key: 'x', label: 'X', step: 1 },
  { key: 'y', label: 'Y', step: 1 },
  { key: 'rotation', label: 'Rotation', step: 1 },
  { key: 'scale', label: 'Scale', step: 0.1 },
  { key: 'opacity', label: 'Opacity', step: 0.1 },
];

export function Inspector() {
  const scene = useSceneStore((s) => s.scene);
  const selectedObjId = useSceneStore((s) => s.selectedObjId);
  const beginInteraction = useSceneStore((s) => s.beginInteraction);
  const endInteraction = useSceneStore((s) => s.endInteraction);
  const updateTransform = useSceneStore((s) => s.updateTransform);
  const updateObjectProps = useSceneStore((s) => s.updateObjectProps);
  const renameObject = useSceneStore((s) => s.renameObject);

  // Name field draft: null = not editing (show stored name).
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameDraftId, setNameDraftId] = useState<string | null>(null);
  // Selection changed mid-edit? Drop the stale draft.
  useEffect(() => {
    setNameDraft(null);
    setNameDraftId(null);
  }, [selectedObjId]);

  // Quick-set preset chips (Wave-3 UX pass): one click = one undo step.
  const applyPreset = (partial: Partial<Transform>) => {
    const target = selectedObject({ selectedObjId, scene });
    if (!target) return;
    beginInteraction();
    updateTransform(target.id, partial);
    endInteraction();
  };

  const obj = selectedObject({ selectedObjId, scene });

  if (!obj) {
    return (
      <div className="inspector">
        <h3>Inspector</h3>
        <p className="hint">No object selected.</p>
      </div>
    );
  }

  const t = obj.transform;

  // ARROW-ONLY props. Length edits the local shaft span (tail→tip); color
  // overrides the stroke everywhere it renders (canvas + Remotion export).
  const isArrow = obj.type === 'arrow';

  return (
    <div className="inspector">
      <h3>Inspector</h3>
      {/* Editable display name (UX repair pass): surfaces in timeline tracks,
          AI resolution, and here. Draft commits on blur/Enter so typing does
          NOT flood undo history with one entry per keystroke. Empty = falls
          back to "type · short-id". */}
      <label className="inspector-field">
        <span>Name</span>
        <input
          type="text"
          spellCheck={false}
          autoComplete="off"
          data-testid="inspector-object-name"
          value={obj.id === nameDraftId && nameDraft !== null ? nameDraft : (obj.name ?? '')}
          placeholder={`${obj.type} · ${obj.id.slice(-4)}`}
          onFocus={() => setNameDraftId(obj.id)}
          onChange={(e) => {
            setNameDraftId(obj.id);
            setNameDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => {
            if (nameDraft !== null) renameObject(obj.id, e.target.value);
            setNameDraft(null);
            setNameDraftId(null);
          }}
        />
      </label>
      <div className="inspector-type">Type: {obj.type}</div>
      {isArrow && (
        <>
          <label className="inspector-field">
            <span>Length</span>
            <input
              type="number"
              spellCheck={false}
              autoComplete="off"
              data-testid="inspector-length"
              min={8}
              value={obj.length ?? DEFAULT_ARROW_LENGTH}
              step={10}
              onFocus={beginInteraction}
              onBlur={endInteraction}
              onChange={(e) => {
                const raw = e.target.value;
                const v = raw === '' ? 0 : Number(raw);
                if (!Number.isFinite(v)) return;
                updateObjectProps(obj.id, { length: Math.max(8, v) });
              }}
            />
          </label>
          <label className="inspector-field">
            <span>Color</span>
            <input
              type="color"
              data-testid="inspector-color"
              value={obj.color ?? DEFAULT_ARROW_COLOR}
              onFocus={beginInteraction}
              onBlur={endInteraction}
              onChange={(e) => {
                updateObjectProps(obj.id, { color: e.target.value });
              }}
            />
          </label>
          {/* §32 signature styles: thickness/head/opacity/dash fixed by the
              shared spec table so canvas and export stay pixel-identical. */}
          <label className="inspector-field">
            <span>Arrow style</span>
            <select
              data-testid="inspector-arrow-style"
              value={obj.arrowStyle ?? ''}
              onFocus={beginInteraction}
              onBlur={endInteraction}
              onChange={(e) => {
                const v = e.target.value;
                updateObjectProps(obj.id, {
                  arrowStyle: v === '' ? undefined : (v as SceneObject['arrowStyle']),
                });
              }}
            >
              <option value="">Attack (default)</option>
              <option value="flank">Flank</option>
              <option value="retreat">Retreat</option>
              <option value="encirclement">Encirclement</option>
              <option value="movement">Movement</option>
              <option value="charge">Charge</option>
            </select>
          </label>
        </>
      )}
      {/* Commander annotations (P2): name label + faction ring + confidence
          badge. Available on any selected object; renderers only paint what's
          set (PRD §36/§37 — annotation layer, never baked into assets). */}
      <label className="inspector-field">
        <span>Commander name</span>
        <input
          type="text"
          spellCheck={false}
          autoComplete="off"
          data-testid="inspector-name"
          value={obj.label ?? ''}
          onFocus={beginInteraction}
          onBlur={endInteraction}
          onChange={(e) => {
            updateObjectProps(obj.id, { label: e.target.value });
          }}
        />
      </label>
      <label className="inspector-field">
        <span>Faction</span>
        <select
          data-testid="inspector-faction"
          value={obj.faction ?? ''}
          onFocus={beginInteraction}
          onBlur={endInteraction}
          onChange={(e) => {
            const v = e.target.value;
            updateObjectProps(obj.id, {
              faction: v === '' ? undefined : (v as SceneObject['faction']),
            });
          }}
        >
          <option value="">None</option>
          <option value="red">Red</option>
          <option value="blue">Blue</option>
          <option value="neutral">Neutral</option>
        </select>
      </label>
      <label className="inspector-field">
        <span>Confidence</span>
        <select
          data-testid="inspector-confidence"
          value={obj.confidence ?? ''}
          onFocus={beginInteraction}
          onBlur={endInteraction}
          onChange={(e) => {
            const v = e.target.value;
            updateObjectProps(obj.id, {
              confidence:
                v === ''
                  ? null
                  : (v as Exclude<SceneObject['confidence'], undefined>),
            });
          }}
        >
          <option value="">None</option>
          <option value="confirmed">Confirmed</option>
          <option value="probable">Probable</option>
          <option value="disputed">Disputed</option>
        </select>
      </label>
      {/* Procedural effects (P2 §50): animated overlay rings painted by both
          render doors. fade/blur/vignette/highlight are intentionally NOT
          stored kinds (opacity keyframes / canvas-filter risk / Scene.vignette
          / Decisive Move highlight cover them). */}
      <label className="inspector-field">
        <span>Effect</span>
        <select
          data-testid="inspector-effect"
          value={obj.effect ?? ''}
          onFocus={beginInteraction}
          onBlur={endInteraction}
          onChange={(e) => {
            const v = e.target.value;
            updateObjectProps(obj.id, {
              effect: v === '' ? undefined : (v as SceneObject['effect']),
            });
          }}
        >
          <option value="">None</option>
          <option value="smoke">Smoke</option>
          <option value="dust">Dust</option>
          <option value="impact">Impact</option>
          <option value="fire">Fire</option>
          <option value="glow">Glow</option>
        </select>
      </label>

      {FIELDS.map((f) => (
        <label key={f.key} className="inspector-field">
          <span>{f.label}</span>
          <input
            type="number"
            spellCheck={false}
            autoComplete="off"
            data-testid={`inspector-${f.key}`}
            value={t[f.key]}
            step={f.step}
            onFocus={beginInteraction}
            onBlur={endInteraction}
            onChange={(e) => {
              const raw = e.target.value;
              const v = raw === '' ? 0 : Number(raw);
              // Mid-edit garbage ('-', 'e', '1e') parses to NaN — never write
              // it into the transform (scene integrity).
              if (!Number.isFinite(v)) return;
              const partial: Partial<Transform> = {};
              partial[f.key] = v;
              updateTransform(obj.id, partial);
            }}
          />
        </label>
      ))}

      {/* §48 depth ordering: direct z write + send-forward/backward chips. */}
      <div className="preset-row">
        <span className="preset-label">Depth</span>
        <input
          type="number"
          spellCheck={false}
          autoComplete="off"
          data-testid="inspector-z"
          value={obj.z ?? 0}
          onFocus={beginInteraction}
          onBlur={endInteraction}
          onChange={(e) => {
            const v = e.target.value === '' ? 0 : Number(e.target.value);
            if (!Number.isFinite(v)) return;
            updateObjectProps(obj.id, { z: v });
          }}
        />
        <button
          type="button"
          className="chip"
          data-testid="depth-backward"
          onClick={() =>
            updateObjectProps(obj.id, {
              z: nextZBelow(Object.values(scene.objects), obj.layerId, obj.id),
            })
          }
        >
          ↓
        </button>
        <button
          type="button"
          className="chip"
          data-testid="depth-forward"
          onClick={() =>
            updateObjectProps(obj.id, {
              z: nextZAbove(Object.values(scene.objects), obj.layerId, obj.id),
            })
          }
        >
          ↑
        </button>
      </div>

      <div className="preset-row">
        <span className="preset-label">Rotate</span>
        {[-90, -45, 45, 90].map((deg) => (
          <button
            key={deg}
            type="button"
            className="chip"
            data-testid={`preset-rot-${deg}`}
            onClick={() => applyPreset({ rotation: deg })}
          >
            {deg > 0 ? `+${deg}°` : `${deg}°`}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          data-testid="preset-rot-0"
          onClick={() => applyPreset({ rotation: 0 })}
        >
          0°
        </button>
      </div>

      <div className="preset-row">
        <span className="preset-label">Opacity</span>
        {[25, 50, 75, 100].map((pct) => (
          <button
            key={pct}
            type="button"
            className="chip"
            data-testid={`preset-op-${pct}`}
            onClick={() => applyPreset({ opacity: pct / 100 })}
          >
            {pct}%
          </button>
        ))}
      </div>
    </div>
  );
}

export default Inspector;
