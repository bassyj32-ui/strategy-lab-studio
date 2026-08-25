import { useState } from 'react';
import type { ObjId, SceneObject } from '../scene/types';
import { useSceneStore } from '../scene/store';
// Unified selection: tree clicks must reach BOTH the scene store (canvas
// highlight + Inspector) and the timeline selection store (KeyframeEditor).
import { selectObjectUnified } from '../timeline/selection';
import { resolveFactionColors } from '../scene/branding';
import { LayersPanel } from './LayersPanel';

/**
 * Armies tree (owner redesign): the whole army as ONE visual hierarchy.
 * Roots are top-level objects; groups/formations expand into indented
 * children. Row click selects on canvas (shift-click toggles multi-select),
 * and Group/Ungroup live right in the header — groups become a light switch:
 * ON = they march as one, OFF = move freely again. The layers list is tucked
 * away as a collapsed disclosure at the bottom.
 */
export function ArmiesPanel() {
  const scene = useSceneStore((s) => s.scene);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const toggleSelected = useSceneStore((s) => s.toggleSelected);
  const groupObject = useSceneStore((s) => s.groupObject);
  const ungroupObject = useSceneStore((s) => s.ungroupObject);

  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<ObjId>>(new Set());
  const [showLayers, setShowLayers] = useState(false);

  const objects = scene.objects;
  const all: SceneObject[] = Object.values(objects);
  const factionColors = resolveFactionColors(scene.brand);

  // Same gating logic as the canvas action bar.
  const canGroup = selectedIds.length >= 2;
  const canUngroup = selectedIds.some((id) => {
    const o = objects[id];
    return o?.type === 'group' || o?.parentId != null;
  });

  const displayName = (o: SceneObject): string =>
    o.name ?? o.label ?? `${o.type} · ${o.id.slice(-4)}`;

  const childrenOf = (id: ObjId): SceneObject[] =>
    all.filter((o) => o.parentId === id);

  const handleGroup = () => {
    const parentId = groupObject(selectedIds);
    if (parentId) selectObjectUnified(parentId);
  };

  const handleUngroup = () => {
    for (const id of selectedIds) {
      const o = objects[id];
      if (!o) continue;
      if (o.type === 'group') {
        ungroupObject(id);
        return;
      }
      if (o.parentId) {
        ungroupObject(o.parentId);
        return;
      }
    }
  };

  const twist = (id: ObjId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderRow = (o: SceneObject, depth: number) => {
    const kids = childrenOf(o.id);
    const isCollapsed = collapsed.has(o.id);
    const selected = selectedIds.includes(o.id);
    return (
      <div key={o.id}>
        <div
          className={`armies-row${selected ? ' selected' : ''}`}
          style={{ paddingLeft: depth * 16 }}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              className="armies-twist"
              data-testid={`armies-twist-${o.id}`}
              aria-expanded={!isCollapsed}
              onClick={() => twist(o.id)}
            >
              {isCollapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="armies-twist-spacer" />
          )}
          {/* Faction color dot (§31 palette, §93 brand overrides). */}
          <span
            className="armies-dot"
            style={{
              background:
                (o.faction && factionColors[o.faction]) || 'transparent',
              boxShadow: o.faction ? 'none' : 'inset 0 0 0 1px var(--edge)',
            }}
          />
          <button
            type="button"
            className="armies-name"
            data-testid={`armies-row-${o.id}`}
            title={o.id}
            onClick={(e) => {
              if (e.shiftKey) {
                toggleSelected(o.id);
                return;
              }
              selectObjectUnified(o.id);
            }}
          >
            {displayName(o)}
            {kids.length > 0 && (
              <span className="armies-count"> ({kids.length})</span>
            )}
          </button>
        </div>
        {kids.length > 0 && !isCollapsed && (
          <div className="armies-children">
            {kids.map((c) => renderRow(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Filtering flattens the tree to matching rows (names only — ids stay
  // internal; display names are what the commander knows).
  const q = query.trim().toLowerCase();
  const rows = q
    ? all.filter((o) => displayName(o).toLowerCase().includes(q))
    : all.filter((o) => o.parentId == null);

  return (
    <div className="armies-panel" data-testid="armies-panel">
      <div className="panel-header">
        <span>Armies</span>
        <button
          type="button"
          data-testid="armies-group"
          disabled={!canGroup}
          title="Group selection (⌘G)"
          onClick={handleGroup}
        >
          Group
        </button>
        <button
          type="button"
          data-testid="armies-ungroup"
          disabled={!canUngroup}
          title="Ungroup (⌘⇧G)"
          onClick={handleUngroup}
        >
          Ungroup
        </button>
      </div>

      <input
        type="text"
        className="asset-search armies-filter"
        data-testid="armies-filter"
        placeholder="Filter units…"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="armies-tree" data-testid="armies-tree">
        {rows.length === 0 ? (
          <p className="hint">
            {q ? 'No units match.' : 'No units yet — place assets from the library.'}
          </p>
        ) : (
          rows.map((o) => renderRow(o, 0))
        )}
      </div>

      <div className="armies-layers">
        <button
          type="button"
          className="disclosure-chip"
          data-testid="armies-layers-toggle"
          aria-expanded={showLayers}
          onClick={() => setShowLayers((v) => !v)}
        >
          Layers {showLayers ? '▴' : '▾'}
        </button>
        {showLayers && <LayersPanel />}
      </div>
    </div>
  );
}

export default ArmiesPanel;
