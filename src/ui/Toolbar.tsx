import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useSceneStore } from '../scene/store';
import type { SceneObjectType, FormationPattern } from '../scene/types';
// Placing an object must also SELECT it (both stores) so the Inspector and
// timeline immediately target the new object.
import { selectObjectUnified } from '../timeline/selection';

// MVP-1 palette: `shape` and `marker`. Arrow (MVP-2): clicking ARMS the
// canvas draw tool instead of instant-placing; drag-drop places a default.
const PALETTE: { type: SceneObjectType; label: string }[] = [
  { type: 'shape', label: 'Shape (blue)' },
  { type: 'marker', label: 'Marker (red)' },
  { type: 'arrow', label: 'Arrow (amber)' },
];

export function Toolbar() {
  const importMap = useSceneStore((s) => s.importMap);
  const createObjectOfType = useSceneStore((s) => s.createObjectOfType);
  const activeTool = useSceneStore((s) => s.activeTool);
  const setTool = useSceneStore((s) => s.setTool);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const groupObject = useSceneStore((s) => s.groupObject);
  const ungroupObject = useSceneStore((s) => s.ungroupObject);
  const createFormation = useSceneStore((s) => s.createFormation);
  const worldSize = useSceneStore((s) => s.scene.worldSize);
  const objects = useSceneStore((s) => s.scene.objects);
  const mapFileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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

  /** Click-to-place: create the object, then select it everywhere. */
  const placeAndSelect = (type: SceneObjectType) => {
    const id = createObjectOfType(type);
    selectObjectUnified(id);
  };

  /**
   * Arrows are drawn, not stamped: clicking the palette item toggles the
   * arrow tool; the canvas gesture then creates tail→head. Other types place
   * immediately as before.
   */
  const handlePaletteClick = (type: SceneObjectType) => {
    if (type === 'arrow') {
      setTool(activeTool === 'arrow' ? 'select' : 'arrow');
      return;
    }
    placeAndSelect(type);
  };

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

  // Per-scene export helper (Tab A): persist the active scene to a portable
  // `scene.json` (headless Remotion export input) AND copy the exact render
  // command so the commander never hand-writes it. The browser cannot run the
  // Remotion CLI itself, so we bridge the last mile with clipboard + download.
  const handleExportVideo = async () => {
    handleSaveScene();
    const cmd =
      'npx remotion render src/render/index.ts BattleScene out/scene.mp4 --props=scene.json';
    try {
      await navigator.clipboard.writeText(cmd);
      setStatus('Saved scene.json + copied export command. Paste it in your terminal.');
    } catch {
      // Non-secure context: clipboard unavailable. The status text still
      // carries the command so the commander can copy it by hand.
      setStatus(`Export command: ${cmd}`);
    }
  };

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
    <div className="toolbar">
      <h3>Palette</h3>
      <p className="hint">
        {activeTool === 'arrow'
          ? 'Arrow tool armed — drag on the canvas to draw tail → head. Click again to disarm.'
          : 'Drag onto the canvas — or click to place.'}
      </p>
      {PALETTE.map((item) => (
        <div
          key={item.type}
          className="palette-item"
          draggable
          role="button"
          tabIndex={0}
          data-testid={`palette-${item.type}`}
          aria-pressed={item.type === 'arrow' && activeTool === 'arrow'}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', item.type);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => handlePaletteClick(item.type)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handlePaletteClick(item.type);
            }
          }}
        >
          {item.label}
        </div>
      ))}

      <h3 style={{ marginTop: 16 }}>Map</h3>
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
        Save Scene JSON
      </button>
      <button
        type="button"
        data-testid="export-video"
        onClick={handleExportVideo}
      >
        Export Video (copy command)
      </button>
      <input
        ref={mapFileRef}
        type="file"
        accept="image/*"
        aria-label="Map image file"
        style={{ display: 'none' }}
        onChange={handleMapFile}
      />

      <h3 style={{ marginTop: 16 }}>Groups</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          data-testid="group"
          disabled={!canGroup}
          onClick={handleGroup}
        >
          Group
        </button>
        <button
          type="button"
          data-testid="ungroup"
          disabled={!canUngroup}
          onClick={handleUngroup}
        >
          Ungroup
        </button>
      </div>

      <h3 style={{ marginTop: 16 }}>Formation</h3>
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
        Child type{' '}
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
          style={{ width: 64 }}
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
          style={{ width: 64 }}
        />
      </label>
      <button
        type="button"
        data-testid="create-formation"
        onClick={handleCreateFormation}
      >
        Create Formation
      </button>

      <p className="hint" aria-live="polite" data-testid="toolbar-status">
        {status}
      </p>
    </div>
  );
}

export default Toolbar;
