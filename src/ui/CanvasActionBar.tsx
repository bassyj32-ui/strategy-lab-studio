import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useSceneStore } from '../scene/store';
import type { FormationPattern } from '../scene/types';
import { ExportDialog } from './ExportDialog';
// Placing a formation must also SELECT it (both stores) so the Inspector and
// timeline immediately target the new object.
import { selectObjectUnified } from '../timeline/selection';
import { groupRootOf } from '../objects/groups';

/**
 * Preset color keys for the background remover — the commander imports simple
 * green-screen / magenta-key sprites (boss-scoped: no eyedropper, preset
 * chips + one custom color + one tolerance slider). The control lives in the
 * canvas toolbar (alongside Draw Path / Smooth Path) and targets the asset
 * card clicked in the library.
 */
export const BG_KEY_PRESETS: Array<{ color: string; label: string }> = [
  { color: '#00ff00', label: 'Green' },
  { color: '#ff00ff', label: 'Magenta' },
  { color: '#0000ff', label: 'Blue' },
  { color: '#ffffff', label: 'White' },
  { color: '#000000', label: 'Black' },
];
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
  const arrangeSelectedIntoFormation = useSceneStore((s) => s.arrangeSelectedIntoFormation);
  const objects = useSceneStore((s) => s.scene.objects);
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);
  const canUndo = useSceneStore((s) => s.past.length > 0);
  const canRedo = useSceneStore((s) => s.future.length > 0);
  const activeTool = useSceneStore((s) => s.activeTool);
  const setTool = useSceneStore((s) => s.setTool);
  const selectedObjId = useSceneStore((s) => s.selectedObjId);
  const setSelected = useSceneStore((s) => s.setSelected);
  const keyframes = useSceneStore((s) => s.scene.keyframes);
  // Background remover: the toolbar control targets the asset card selected in
  // the Assets panel (shared store-root id). Non-map assets only.
  const assets = useSceneStore((s) => s.scene.assets);
  const bgTargetAssetId = useSceneStore((s) => s.bgTargetAssetId);
  const setBgTargetAssetId = useSceneStore((s) => s.setBgTargetAssetId);
  const removeAssetBackground = useSceneStore((s) => s.removeAssetBackground);
  const mapFileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [pattern, setPattern] = useState<FormationPattern>('line');
  const [spacing, setSpacing] = useState(50);
  // Background-remover picker state (popover lives in the toolbar).
  // 'auto' = sample the 4 corners (default — fixes green-screen variance).
  const [bgOpen, setBgOpen] = useState(false);
  const [bgColorKey, setBgColorKey] = useState('auto');
  const [bgTolerance, setBgTolerance] = useState(30);
  const [bgBusy, setBgBusy] = useState(false);

  const canGroup = selectedIds.length >= 2;
  // Ungroup is available when a selected object IS a group, or is parented.
  const canUngroup = selectedIds.some((id) => {
    const o = objects[id];
    return o?.type === 'group' || o?.parentId != null;
  });
  // Smooth path: need a selected object with at least two position keyframes.
  const canSmooth =
    selectedObjId != null && (keyframes[selectedObjId] ?? []).length >= 2;

  // Count valid unit objects in the current selection.
  const validUnitCount = selectedIds.filter(
    (id) => objects[id]?.type === 'unit',
  ).length;
  const canArrangeFormation = validUnitCount >= 2;

  // Move Group: enabled when the selection is a child of a group (not the root).
  const selectedIsGroupedChild =
    selectedObjId != null &&
    objects[selectedObjId]?.parentId != null &&
    groupRootOf(objects, selectedObjId) !== selectedObjId;

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

  // Select the parent group so the user can drag to move the whole group.
  const handleMoveGroup = () => {
    if (!selectedObjId) return;
    const rootId = groupRootOf(objects, selectedObjId);
    setSelected(rootId);
  };

  // Arrange EXISTING selected units into a formation (one undoable txn).
  const handleArrangeFormation = () => {
    const groupId = arrangeSelectedIntoFormation(pattern, { spacing });
    if (groupId) {
      selectObjectUnified(groupId);
      setStatus(`Arranged units into ${pattern} formation`);
    }
  };

  // Background remover target: the asset card clicked in the library. Only
  // non-map assets are keyable — a map's own transparency stays untouched.
  const bgTarget =
    bgTargetAssetId != null &&
    assets[bgTargetAssetId] &&
    assets[bgTargetAssetId].kind !== 'map'
      ? assets[bgTargetAssetId]
      : undefined;

  // Key out the target's solid background on an offscreen canvas and register
  // a NEW derived asset "(BG removed)". ONE undoable transaction; the original
  // bytes are never rewritten (non-destructive, PRD §43).
  const handleRemoveBackground = async () => {
    if (!bgTarget) return;
    setBgBusy(true);
    try {
      const auto = bgColorKey === 'auto';
      const newId = await removeAssetBackground(
        bgTarget.id,
        auto ? undefined : bgColorKey,
        auto ? undefined : bgTolerance,
      );
      if (newId) {
        // Read the fresh copy's name from the store — the selector snapshot
        // above predates the transaction that just created it.
        const name =
          useSceneStore.getState().scene.assets[newId]?.name ?? 'new asset';
        setBgTargetAssetId(newId);
        setBgOpen(false);
        setStatus(`Background removed — created “${name}”`);
      } else {
        setStatus('Background removal failed — is the image loadable?');
      }
    } catch (err) {
      setStatus(
        `Background removal failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBgBusy(false);
    }
  };

  // Smooth path: convert each interior keyframe into Catmull-Rom → cubic
  // Bezier handles (cpOut/cpIn), so a drawn path eases between waypoints
  // instead of snapping. Keyframes with easing 'hold' are left straight
  // (the segment holds position). ONE undo step (begin/endInteraction +
  // session-contract setKeyframeCp — no per-keyframe history).
  const handleSmoothPath = () => {
    const store = useSceneStore.getState();
    const obj = store.selectedObjId ? store.scene.objects[store.selectedObjId] : undefined;
    if (!obj) return;
    const list = [...(store.scene.keyframes[obj.id] ?? [])].sort((a, b) => a.time - b.time);
    if (list.length < 2) return;
    store.beginInteraction();
    try {
      for (let i = 0; i < list.length; i++) {
        const k = list[i];
        if (k.easing === 'hold') continue; // hold segment: keep sharp stop
        const prev = list[i - 1] ?? list[i];
        const next = list[i + 1] ?? list[i];
        // Catmull-Rom tangent at this keyframe: (next - prev) * 0.16 ≈ 1/6
        // chord rule; cpOut aims forward, cpIn mirrors it for C1 continuity.
        const cp = {
          dx: (next.transform.x - prev.transform.x) * 0.16,
          dy: (next.transform.y - prev.transform.y) * 0.16,
        };
        store.setKeyframeCp(obj.id, k.time, 'cpOut', cp);
        store.setKeyframeCp(obj.id, k.time, 'cpIn', { dx: -cp.dx, dy: -cp.dy });
      }
    } finally {
      store.endInteraction();
    }
    setStatus('Smoothed path');
  };

  // Battle FX: scan every opposing (red-vs-blue) unit pair for the FIRST
  // moment their interpolated world positions come within a threshold, then
  // materialize impact + lingering-smoke bursts there. Deterministic, one
  // undo step, and identical in Remotion export.
  const handleBattleFx = () => {
    const clashes = useSceneStore.getState().detectBattleEffects();
    if (clashes.length === 0) {
      setStatus('Battle FX: no opposing-unit clashes detected');
      return;
    }
    const times = [...new Set(clashes.map((c) => c.time))]
      .sort((a, b) => a - b)
      .slice(0, 3)
      .map((t) => `${t.toFixed(1)}s`);
    setStatus(`Battle FX: ${clashes.length} bursts at ${times.join(', ')}${times.length === 3 ? '…' : ''}`);
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
      <button
        type="button"
        data-testid="move-group"
        disabled={!selectedIsGroupedChild}
        title="Select the parent group so you can drag to move it"
        onClick={handleMoveGroup}
      >
        Move Group
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
      <button
        type="button"
        data-testid="smooth-path"
        disabled={!canSmooth}
        title="Smooth path — add easing handles between waypoints so the object glides instead of snapping (keyframes marked Hold are kept sharp); one undo step"
        onClick={handleSmoothPath}
      >
        Smooth Path
      </button>
      <button
        type="button"
        data-testid="battle-fx-btn"
        title="Battle FX — scan opposing units for clashes and add impact bursts at each; one undo step"
        onClick={handleBattleFx}
      >
        Battle FX
      </button>

      <span className="bg-remover-wrap">
        <button
          type="button"
          data-testid="remove-bg-btn"
          disabled={!bgTarget || bgBusy}
          title={
            bgTarget
              ? `Remove solid-color background from “${bgTarget.name}”`
              : 'Click an asset card in the library to target its background'
          }
          onClick={() => setBgOpen((v) => !v)}
        >
          Remove BG
        </button>
        {bgOpen && bgTarget && (
          <div className="bg-remover" data-testid="bg-remover">
            <div className="bg-remover-head">
              <span className="bg-remover-title" title={bgTarget.name}>
                {bgTarget.name}
              </span>
              <button
                type="button"
                className="bg-close"
                data-testid="bg-close"
                aria-label="Close background remover"
                onClick={() => setBgOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="bg-keys" aria-label="Background color key">
              <button
                type="button"
                data-testid="bg-key-auto"
                className={`bg-key-chip${bgColorKey === 'auto' ? ' active' : ''}`}
                aria-pressed={bgColorKey === 'auto'}
                title="Auto-detect from the image corners (recommended for green screens)"
                onClick={() => setBgColorKey('auto')}
              >
                Auto
              </button>
              {BG_KEY_PRESETS.map((p) => (
                <button
                  key={p.color}
                  type="button"
                  data-testid={`bg-key-${p.color.replace('#', '')}`}
                  className={`bg-key-chip${bgColorKey === p.color ? ' active' : ''}`}
                  aria-pressed={bgColorKey === p.color}
                  title={p.label}
                  onClick={() => setBgColorKey(p.color)}
                >
                  <span className="bg-swatch" style={{ background: p.color }} />
                  {p.label}
                </button>
              ))}
            </div>
            <label className="bg-custom">
              Custom
              <input
                type="color"
                data-testid="bg-color"
                value={bgColorKey === 'auto' ? '#00ff00' : bgColorKey}
                onChange={(e) => setBgColorKey(e.target.value)}
              />
            </label>
            <label className="bg-tolerance">
              Tolerance · {bgTolerance}
              <input
                type="range"
                min={0}
                max={100}
                data-testid="bg-tolerance"
                value={bgTolerance}
                onChange={(e) => setBgTolerance(Number(e.target.value))}
              />
            </label>
            <div className="bg-actions">
              <button
                type="button"
                data-testid="bg-apply"
                disabled={bgBusy}
                onClick={handleRemoveBackground}
              >
                {bgBusy ? 'Removing…' : 'Remove & create copy'}
              </button>
            </div>
          </div>
        )}
      </span>

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
        <span className="formation-info" data-testid="formation-unit-count">
          Selected Units: {validUnitCount}
        </span>
        <button
          type="button"
          data-testid="create-formation"
          disabled={!canArrangeFormation}
          title={
            canArrangeFormation
              ? 'Arrange selected units into formation'
              : 'Select at least 2 units to arrange'
          }
          onClick={handleArrangeFormation}
        >
          Arrange Selected Units
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
