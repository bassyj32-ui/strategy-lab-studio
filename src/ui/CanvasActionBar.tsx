import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useSceneStore } from '../scene/store';
import type { SceneObjectType, FormationPattern } from '../scene/types';
import { ExportDialog } from './ExportDialog';
// Placing a formation must also SELECT it (both stores) so the Inspector and
// timeline immediately target the new object.
import { selectObjectUnified } from '../timeline/selection';

/**
 * Slim horizontal strip on top of the canvas holding everything that acts ON
 * the canvas: map import, scene save/export, group/ungroup and the formation
 * builder (prominent per owner). Replaces the old left Toolbar — the left
 * column is the asset library now. Draw palette removed entirely (owner
 * imports his own arrow sprites); the arrow ENGINE stays for AI tools,
 * drag-drop and existing scenes.
 */
export function CanvasActionBar() {
  const importMap = useSceneStore((s) => s.importMap);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const groupObject = useSceneStore((s) => s.groupObject);
  const ungroupObject = useSceneStore((s) => s.ungroupObject);
  const createFormation = useSceneStore((s) => s.createFormation);
  const worldSize = useSceneStore((s) => s.scene.worldSize);
  const objects = useSceneStore((s) => s.scene.objects);
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);
  const canUndo = useSceneStore((s) => s.past.length > 0);
  const canRedo = useSceneStore((s) => s.future.length > 0);
  const activeTool = useSceneStore((s) => s.activeTool);
  const setTool = useSceneStore((s) => s.setTool);
  const mapFileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [pattern, setPattern] = useState<FormationPattern>('line');
  const [count, setCount] = useState(5);
  const [spacing, setSpacing] = useState(50);
  const [childType, setChildType] = useState<SceneObjectType>('unit');

  const canGroup = selectedIds.length >= 2;
  // Ungroup is available when a selected object IS a group, or is parented.
  const canUngroup = selectedIds.some((id) => {
    const o = objects[id];
    return o?.type === 'group' || o?.parentId != null;
  });

  const handleMapFile = async (e: ChangeEvent<HTMLInputElement>) => {
    // Reset first so re-selecting the same file still fires onChange.
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await importMap(file);
      setStatus(`Map loaded: ${file.name}`);
    } catch (err) {
      setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Serializes the live scene (assets included, maps already stored as
  // portable data: URLs) — this exact file drives headless export:
  //   npx remotion render src/render/index.ts BattleScene out/video.mp4 --props=scene.json
  const handleSaveScene = () => {
    const scene = useSceneStore.getState().scene;
    const blob = new Blob([JSON.stringify(scene, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Saved scene.json');
  };

  // One-click Export: open the Export dialog, which streams a server-side
  // Remotion render (never inside the browser) and reports progress over SSE.
  const openExport = () => setShowExport(true);

  // Group the current multi-selection into one parent (one undoable txn).
  const handleGroup = () => {
    const parentId = groupObject(selectedIds);
    if (parentId) {
      selectObjectUnified(parentId);
      setStatus('Grouped selection');
    }
  };

  // Dissolve the group that owns any selected object.
  const handleUngroup = () => {
    for (const id of selectedIds) {
      const o = objects[id];
      if (!o) continue;
      if (o.type === 'group') {
        ungroupObject(id);
        setStatus('Ungrouped');
        return;
      }
      if (o.parentId) {
        ungroupObject(o.parentId);
        setStatus('Ungrouped');
        return;
      }
    }
  };

  // Spawn a formation at the map centre on the active layer (one undoable txn).
  const handleCreateFormation = () => {
    const { groupId } = createFormation(pattern, {
      count,
      spacing,
      childType,
      x: worldSize.w / 2,
      y: worldSize.h / 2,
    });
    if (groupId) {
      selectObjectUnified(groupId);
      setStatus(`Created ${pattern} formation`);
    }
  };

  return (
    <div className="action-bar">
      <button
        type="button"
        data-testid="import-map"
        onClick={() => mapFileRef.current?.click()}
      >
        Import Map…
      </button>
      <button
        type="button"
        data-testid="save-scene"
        onClick={handleSaveScene}
      >
        Save Project
      </button>
      <button
        type="button"
        data-testid="export-video"
        onClick={openExport}
      >
        Export Video…
      </button>

      <span className="action-sep" aria-hidden="true" />

      <button
        type="button"
        data-testid="undo"
        disabled={!canUndo}
        title="Undo (⌘Z)"
        onClick={undo}
      >
        ↩ Undo
      </button>
      <button
        type="button"
        data-testid="redo"
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
        onClick={redo}
      >
        ↪ Redo
      </button>

      <span className="action-sep" aria-hidden="true" />

      <button
        type="button"
        data-testid="group"
        disabled={!canGroup}
        title="Group selection (⌘G)"
        onClick={handleGroup}
      >
        Group
      </button>
      <button
        type="button"
        data-testid="ungroup"
        disabled={!canUngroup}
        title="Ungroup (⌘⇧G)"
        onClick={handleUngroup}
      >
        Ungroup
      </button>

      <span className="action-sep" aria-hidden="true" />

      <button
        type="button"
        data-testid="path-tool"
        className={activeTool === 'path' ? 'active' : undefined}
        title="Draw path — click waypoints, double-click to finish"
        onClick={() => setTool(activeTool === 'path' ? 'select' : 'path')}
      >
        {activeTool === 'path' ? '✓ Path' : 'Draw Path'}
      </button>

      <span className="action-sep" aria-hidden="true" />

      <span className="formation-controls" aria-label="Formation builder">
        <strong>Formations</strong>
        <label>
          Pattern{' '}
          <select
            data-testid="formation-pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value as FormationPattern)}
          >
            <option value="line">Line</option>
            <option value="column">Column</option>
            <option value="wedge">Wedge</option>
            <option value="grid">Grid</option>
          </select>
        </label>
        <label>
          Child{' '}
          <select
            data-testid="formation-child-type"
            value={childType}
            onChange={(e) => setChildType(e.target.value as SceneObjectType)}
          >
            <option value="unit">Unit</option>
            <option value="shape">Shape</option>
            <option value="marker">Marker</option>
          </select>
        </label>
        <label>
          Count{' '}
          <input
            type="number"
            data-testid="formation-count"
            min={1}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 56 }}
          />
        </label>
        <label>
          Spacing{' '}
          <input
            type="number"
            data-testid="formation-spacing"
            min={1}
            value={spacing}
            onChange={(e) => setSpacing(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 56 }}
          />
        </label>
        <button
          type="button"
          data-testid="create-formation"
          onClick={handleCreateFormation}
        >
          Create Formation
        </button>
      </span>

      <p className="hint action-status" aria-live="polite" data-testid="toolbar-status">
        {status}
      </p>

      <input
        ref={mapFileRef}
        type="file"
        accept="image/*"
        aria-label="Map image file"
        style={{ display: 'none' }}
        onChange={handleMapFile}
      />
      <ExportDialog open={showExport} onClose={() => setShowExport(false)} />
    </div>
  );
}

export default CanvasActionBar;
