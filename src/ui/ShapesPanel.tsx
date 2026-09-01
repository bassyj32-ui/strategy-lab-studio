import { useState } from 'react';
import { useSceneStore } from '../scene/store';
import type { FormationPattern, Faction, AssetId, ObjId } from '../scene/types';

const PATTERNS: { key: FormationPattern; label: string }[] = [
  { key: 'line', label: 'Line' },
  { key: 'column', label: 'Column' },
  { key: 'wedge', label: 'Wedge' },
  { key: 'grid', label: 'Grid' },
  { key: 'crescent', label: 'Crescent' },
  { key: 'circle', label: 'Circle' },
];

/**
 * Shapes panel (NEW, replaces the AI tab per boss directive): build slick
 * multi-unit formations — line / column / wedge / grid / crescent / circle —
 * by creating an empty shape GROUP on the canvas, then adding unit sprites to
 * it one at a time. Deterministic, commander-controlled; every mutation is a
 * single undoable transaction. No AI involved — this is a FAST pure tool.
 */
export function ShapesPanel() {
  const createShapeGroup = useSceneStore((s) => s.createShapeGroup);
  const addUnitToShape = useSceneStore((s) => s.addUnitToShape);
  const assets = useSceneStore((s) => s.scene.assets);
  const shapeTargetId = useSceneStore((s) => s.shapeTargetId);
  const setShapeTargetId = useSceneStore((s) => s.setShapeTargetId);
  const groups = useSceneStore((s) =>
    Object.values(s.scene.objects).filter((o) => o.type === 'group')
  );
  const objects = useSceneStore((s) => s.scene.objects);

  const [pattern, setPattern] = useState<FormationPattern>('line');
  const [spacing, setSpacing] = useState(50);
  const [radius, setRadius] = useState(100);
  const [orientation, setOrientation] = useState(0);
  const [faction, setFaction] = useState<Faction>('red');
  const [assetId, setAssetId] = useState<AssetId | ''>('');

  const unitAssets = Object.values(assets).filter(
    (a) => a.kind !== 'map' && a.metadata?.category !== 'Markers'
  );
  const effectiveAsset = assetId
    ? assets[assetId]
    : unitAssets.find((a) => a.metadata?.faction === faction) ?? unitAssets[0];

  const handleCreate = () => {
    const gid = createShapeGroup(pattern, {
      spacing,
      radius: pattern === 'crescent' || pattern === 'circle' ? radius : undefined,
      orientation,
    });
    if (gid && effectiveAsset) {
      addUnitToShape(gid, effectiveAsset.id);
    }
  };

  const handleAdd = () => {
    if (!shapeTargetId) return;
    const id = effectiveAsset ? effectiveAsset.id : unitAssets[0]?.id;
    if (id) addUnitToShape(shapeTargetId, id);
  };

  return (
    <div className="shapes-panel" data-testid="shapes-panel">
      <div className="shapes-head">
        <h3>Formations</h3>
        <p className="shapes-sub">
          Build deterministic multi-unit formations. Create a shape group, then
          drop unit sprites into it.
        </p>
      </div>

      <label className="shapes-field">
        <span>Pattern</span>
        <div className="shapes-patterns" role="group" aria-label="Formation pattern">
          {PATTERNS.map((p) => (
            <button
              key={p.key}
              type="button"
              data-testid={`shape-pattern-${p.key}`}
              className={`shape-chip${pattern === p.key ? ' active' : ''}`}
              aria-pressed={pattern === p.key}
              onClick={() => setPattern(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </label>

      <label className="shapes-field">
        <span>Spacing</span>
        <input
          type="number"
          data-testid="shape-spacing"
          min={10}
          max={500}
          value={spacing}
          onChange={(e) => setSpacing(Math.max(10, Number(e.target.value) || 50))}
        />
      </label>

      {(pattern === 'crescent' || pattern === 'circle') && (
        <label className="shapes-field">
          <span>Radius</span>
          <input
            type="number"
            data-testid="shape-radius"
            min={20}
            max={1000}
            value={radius}
            onChange={(e) => setRadius(Math.max(20, Number(e.target.value) || 100))}
          />
        </label>
      )}

      <label className="shapes-field">
        <span>Orientation°</span>
        <input
          type="number"
          data-testid="shape-orientation"
          min={0}
          max={360}
          value={orientation}
          onChange={(e) => setOrientation(Number(e.target.value) || 0)}
        />
      </label>

      <div className="shapes-actions">
        <button
          type="button"
          data-testid="shape-create"
          className="shape-create-btn"
          onClick={handleCreate}
        >
          Create {pattern} shape
        </button>
      </div>

      <hr className="shapes-hr" />

      <fieldset className="shapes-fieldset">
        <legend>Add units</legend>

        <label className="shapes-field">
          <span>Faction</span>
          <select
            data-testid="shape-faction"
            value={faction}
            onChange={(e) => setFaction(e.target.value as Faction)}
          >
            <option value="red">Red</option>
            <option value="blue">Blue</option>
            <option value="neutral">Neutral</option>
          </select>
        </label>

        <label className="shapes-field">
          <span>Asset</span>
          <select
            data-testid="shape-asset"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value as AssetId | '')}
          >
            <option value="">Auto (first {faction})</option>
            {unitAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.metadata?.faction ? ` · ${a.metadata.faction}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="shapes-field">
          <span>Shape group</span>
          <select
            data-testid="shape-target"
            value={shapeTargetId ?? ''}
            onChange={(e) => setShapeTargetId((e.target.value as ObjId) || null)}
          >
            <option value="">{shapeTargetId ? targetIdShort(shapeTargetId) : '— select a group —'}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name ? `${g.name} (${directCount(g, objects)})` : `${g.id.slice(-6)} (${directCount(g, objects)})`}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          data-testid="shape-add-unit"
          className="shape-add-btn"
          onClick={handleAdd}
          disabled={!shapeTargetId}
        >
          Add unit to shape
        </button>
      </fieldset>
    </div>
  );
}

/** Count direct children of a group across ALL scene objects (units etc.). */
function directCount(
  g: { id: string },
  objects: Record<string, { parentId?: string | null }>
) {
  return Object.values(objects).filter((x) => x.parentId === g.id).length;
}

/** Short id for a null-target placeholder. */
function targetIdShort(id: string) {
  return id.slice(-8);
}
