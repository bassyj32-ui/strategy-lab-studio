import { useRef, useState } from 'react';
import { useSceneStore } from '../scene/store';

/**
 * Read a picked file as text. `Blob.text()` is the modern path; the
 * FileReader fallback covers environments without it (same portability
 * rationale as assets/import.ts).
 */
async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error('Could not read the selected file.'));
    reader.readAsText(file);
  });
}

/**
 * Multi-scene panel: switch / add / duplicate / rename / delete scenes and
 * save/load the WHOLE project as versioned JSON (LAW: full-project save).
 */
export function ScenesPanel() {
  const scene = useSceneStore((s) => s.scene);
  const inactiveScenes = useSceneStore((s) => s.inactiveScenes);
  const addScene = useSceneStore((s) => s.addScene);
  const duplicateActiveScene = useSceneStore((s) => s.duplicateActiveScene);
  const removeScene = useSceneStore((s) => s.removeScene);
  const switchScene = useSceneStore((s) => s.switchScene);
  const renameScene = useSceneStore((s) => s.renameScene);
  const getProject = useSceneStore((s) => s.getProject);
  const loadProjectFromJson = useSceneStore((s) => s.loadProjectFromJson);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Active scene first (it is what the canvas shows), then insertion order.
  const ordered = [
    { id: scene.id, name: scene.name, active: true },
    ...Object.values(inactiveScenes).map((s) => ({
      id: s.id,
      name: s.name,
      active: false,
    })),
  ];
  const canDelete = ordered.length > 1;

  const commitRename = (id: string) => {
    const name = editValue.trim();
    if (name) renameScene(id, name);
    setEditingId(null);
  };

  const saveProject = () => {
    const json = JSON.stringify(getProject(), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.json';
    a.click();
    // Defer the revoke: revoking in the same tick as click() can cancel the
    // download in some browsers (Safari notably).
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setError(null);
      // Validated + fully undoable inside the store; a rejected file throws
      // before any state changes. file.text() is preferred; the FileReader
      // fallback keeps the same code path working where Blob.text() is
      // unavailable (older runtimes / test environments).
      loadProjectFromJson(await readFileText(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="layers-panel">
      <h3>Scenes</h3>
      <ul className="layer-list">
        {ordered.map((entry) => (
          <li
            key={entry.id}
            className={entry.active ? 'layer active' : 'layer'}
          >
            {editingId === entry.id ? (
              <input
                autoFocus
                className="layer-name"
                data-testid={`scene-rename-${entry.id}`}
                value={editValue}
                autoComplete="off"
                spellCheck={false}
                aria-label="Scene name"
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitRename(entry.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    commitRename(entry.id);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="layer-name"
                data-testid={`scene-select-${entry.id}`}
                onClick={() => switchScene(entry.id)}
                onDoubleClick={() => {
                  setEditingId(entry.id);
                  setEditValue(entry.name);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'F2' || e.key === 'Enter') {
                    setEditingId(entry.id);
                    setEditValue(entry.name);
                    e.preventDefault();
                  }
                }}
              >
                <span>{entry.name}</span>
              </button>
            )}
            <div className="layer-actions">
              <button
                type="button"
                data-testid={`scene-duplicate-${entry.id}`}
                disabled={!entry.active}
                title={
                  entry.active
                    ? 'Duplicate this scene'
                    : 'Switch to a scene to duplicate it'
                }
                onClick={() => duplicateActiveScene()}
              >
                Copy
              </button>
              <button
                type="button"
                data-testid={`scene-delete-${entry.id}`}
                disabled={!canDelete}
                onClick={() => removeScene(entry.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="layer-add">
        <input
          data-testid="scene-name-input"
          placeholder="New scene name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          data-testid="scene-add"
          onClick={() => {
            addScene(newName.trim() || undefined);
            setNewName('');
          }}
        >
          Add
        </button>
      </div>
      <div className="layer-add">
        <button type="button" data-testid="scene-save-project" onClick={saveProject}>
          Save Project
        </button>
        <button
          type="button"
          data-testid="scene-load-project"
          onClick={() => fileRef.current?.click()}
        >
          Load Project
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          data-testid="scene-load-input"
          onChange={(e) => {
            void onPickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <p role="alert" data-testid="scene-error" className="status-hint">
          {error}
        </p>
      )}
    </div>
  );
}

export default ScenesPanel;
