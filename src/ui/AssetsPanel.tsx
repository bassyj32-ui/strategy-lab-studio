import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useSceneStore } from '../scene/store';

/** Custom MIME used to carry a library asset id onto the canvas drop target. */
export const ASSET_DND_MIME = 'application/x-asset-id';

/**
 * Project-wide asset library panel (P2 pull-forward, owner-approved). Assets
 * are stored per-scene but MIRRORED across every scene (see sceneSystem.ts),
 * so a file imported here is available in all scenes. The active scene's
 * `assets` map is the canonical view of the shared library. Drag an asset card
 * onto the canvas to place it as a marker referencing that asset id.
 */
export function AssetsPanel() {
  const assets = useSceneStore((s) => s.scene.assets);
  const importAsset = useSceneStore((s) => s.importAsset);
  const deleteAsset = useSceneStore((s) => s.deleteAsset);
  const canDeleteAsset = useSceneStore((s) => s.canDeleteAsset);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ordered = Object.values(assets);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    try {
      await importAsset(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="assets-panel" data-testid="assets-panel">
      <div className="panel-header">
        <span>Assets</span>
        <button
          type="button"
          data-testid="import-asset"
          onClick={() => fileRef.current?.click()}
        >
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onPick}
        />
      </div>

      {error && <div className="assets-error">{error}</div>}

      <div className="assets-list">
        {ordered.length === 0 && (
          <div className="assets-empty">No assets yet — import an image.</div>
        )}
        {ordered.map((asset) => {
          const removable = canDeleteAsset(asset.id);
          return (
            <div
              key={asset.id}
              className="asset-card"
              data-testid={`asset-${asset.id}`}
              draggable
              onDragStart={(e: DragEvent<HTMLDivElement>) => {
                e.dataTransfer.setData(ASSET_DND_MIME, asset.id);
                e.dataTransfer.setData('text/plain', 'marker');
                e.dataTransfer.effectAllowed = 'copy';
              }}
              title={asset.name}
            >
              <img className="asset-thumb" src={asset.src} alt={asset.name} />
              <div className="asset-meta">
                <span className="asset-name">{asset.name}</span>
                <span className="asset-kind">{asset.kind}</span>
              </div>
              <button
                type="button"
                data-testid={`delete-asset-${asset.id}`}
                disabled={!removable}
                title={
                  removable
                    ? 'Delete asset'
                    : 'In use — remove its objects first'
                }
                onClick={() => deleteAsset(asset.id)}
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
