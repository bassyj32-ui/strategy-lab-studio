import type { Transform } from '../scene/types';
import { useSceneStore } from '../scene/store';
import { selectedObject } from '../scene/selectors';
import { DEFAULT_ARROW_LENGTH, DEFAULT_ARROW_COLOR } from '../objects/factory';

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
        </>
      )}
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
    </div>
  );
}

export default Inspector;
