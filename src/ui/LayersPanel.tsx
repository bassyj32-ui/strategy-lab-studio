import { useState } from 'react';
import { useSceneStore } from '../scene/store';

export function LayersPanel() {
  const scene = useSceneStore((s) => s.scene);
  const activeLayerId = useSceneStore((s) => s.activeLayerId);
  const addLayer = useSceneStore((s) => s.addLayer);
  const renameLayer = useSceneStore((s) => s.renameLayer);
  const toggleLayerVisible = useSceneStore((s) => s.toggleLayerVisible);
  const reorderLayers = useSceneStore((s) => s.reorderLayers);
  const removeLayer = useSceneStore((s) => s.removeLayer);
  const setActiveLayer = useSceneStore((s) => s.setActiveLayer);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const layers = [...scene.layers].sort((a, b) => a.order - b.order);
  const canDelete = layers.length > 1;

  const commitRename = (id: string) => {
    const name = editValue.trim();
    if (name) renameLayer(id, name);
    setEditingId(null);
  };

  return (
    <div className="layers-panel">
      <h3>Layers</h3>
      <ul className="layer-list">
        {layers.map((layer) => (
          <li
            key={layer.id}
            className={layer.id === activeLayerId ? 'layer active' : 'layer'}
          >
            {editingId === layer.id ? (
              <input
                autoFocus
                className="layer-name"
                data-testid={`layer-rename-${layer.id}`}
                value={editValue}
                autoComplete="off"
                spellCheck={false}
                aria-label="Layer name"
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitRename(layer.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    commitRename(layer.id);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="layer-name"
                data-testid={`layer-select-${layer.id}`}
                onClick={() => setActiveLayer(layer.id)}
                onDoubleClick={() => {
                  setEditingId(layer.id);
                  setEditValue(layer.name);
                }}
                onKeyDown={(e) => {
                  // Keyboard path into rename (double-click alternative).
                  if (e.key === 'F2' || e.key === 'Enter') {
                    setEditingId(layer.id);
                    setEditValue(layer.name);
                    e.preventDefault();
                  }
                }}
              >
                <span>
                  {layer.name}
                  {layer.visible ? '' : ' (hidden)'}
                </span>
              </button>
            )}
            <div className="layer-actions">
              <button
                type="button"
                data-testid={`layer-toggle-${layer.id}`}
                onClick={() => toggleLayerVisible(layer.id)}
              >
                {layer.visible ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                data-testid={`layer-up-${layer.id}`}
                aria-label={`Move ${layer.name} up`}
                onClick={() => reorderLayers(layer.id, 'up')}
              >
                ↑
              </button>
              <button
                type="button"
                data-testid={`layer-down-${layer.id}`}
                aria-label={`Move ${layer.name} down`}
                onClick={() => reorderLayers(layer.id, 'down')}
              >
                ↓
              </button>
              <button
                type="button"
                data-testid={`layer-delete-${layer.id}`}
                disabled={!canDelete}
                onClick={() => removeLayer(layer.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="layer-add">
        <input
          data-testid="layer-name-input"
          placeholder="New layer name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          data-testid="layer-add"
          onClick={() => {
            addLayer(newName.trim() || 'Layer');
            setNewName('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

export default LayersPanel;
