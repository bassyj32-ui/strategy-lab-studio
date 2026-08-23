import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useSceneStore } from '../scene/store';
import type { SceneObjectType } from '../scene/types';
// Placing an object must also SELECT it (both stores) so the Inspector and
// timeline immediately target the new object.
import { selectObjectUnified } from '../timeline/selection';

// MVP-1 palette: only `shape` and `marker`. Unit is reserved (not included).
const PALETTE: { type: SceneObjectType; label: string }[] = [
  { type: 'shape', label: 'Shape (blue)' },
  { type: 'marker', label: 'Marker (red)' },
];

export function Toolbar() {
  const importMap = useSceneStore((s) => s.importMap);
  const createObjectOfType = useSceneStore((s) => s.createObjectOfType);
  const mapFileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  /** Click-to-place: create the object, then select it everywhere. */
  const placeAndSelect = (type: SceneObjectType) => {
    const id = createObjectOfType(type);
    selectObjectUnified(id);
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

  return (
    <div className="toolbar">
      <h3>Palette</h3>
      <p className="hint">Drag onto the canvas — or click to place.</p>
      {PALETTE.map((item) => (
        <div
          key={item.type}
          className="palette-item"
          draggable
          role="button"
          tabIndex={0}
          data-testid={`palette-${item.type}`}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', item.type);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => placeAndSelect(item.type)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              placeAndSelect(item.type);
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
      <input
        ref={mapFileRef}
        type="file"
        accept="image/*"
        aria-label="Map image file"
        style={{ display: 'none' }}
        onChange={handleMapFile}
      />
      <p className="hint" aria-live="polite" data-testid="toolbar-status">
        {status}
      </p>
    </div>
  );
}

export default Toolbar;
