import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useSceneStore } from '../scene/store';
import type { AssetCategory, AssetMetadata, Faction } from '../scene/types';
// Placing a unit from a library card must also SELECT it everywhere.
import { selectObjectUnified } from '../timeline/selection';
// Folder import builds sprite assets from files (faction/category inferred
// from the file name, overridable with the default pickers).
import { importAssetFromFile } from '../assets/import';

/** Custom MIME used to carry a library asset id onto the canvas drop target. */
export const ASSET_DND_MIME = 'application/x-asset-id';

/**
 * Asset categories that represent battlefield UNITS (as opposed to markers,
 * maps, terrain, etc.). A library asset in one of these categories is dragged
 * onto the canvas as a UNIT object (carrying its sprite image), not a marker.
 */
export const UNIT_CATEGORIES: AssetCategory[] = [
  'Infantry',
  'Cavalry',
  'Archers',
  'Elephants',
  'Commanders',
  'Banners',
  'Weapons',
];

/** True when an asset is a unit sprite (drives the drop + "Place as unit" UI). */
export function isUnitAsset(a: { metadata?: AssetMetadata }): boolean {
  return (
    a.metadata?.category !== undefined &&
    UNIT_CATEGORIES.includes(a.metadata.category)
  );
}

/**
 * Project-wide asset library panel (P2 pull-forward, owner-approved). Assets
 * are stored per-scene but MIRRORED across every scene (see sceneSystem.ts),
 * so a file imported here is available in all scenes. The active scene's
 * `assets` map is the canonical view of the shared library. Drag an asset card
 * onto the canvas to place it as a marker (or a unit, for unit-category
 * sprites) referencing that asset id.
 */
export function AssetsPanel() {
  const assets = useSceneStore((s) => s.scene.assets);
  const worldSize = useSceneStore((s) => s.scene.worldSize);
  const importAsset = useSceneStore((s) => s.importAsset);
  const deleteAsset = useSceneStore((s) => s.deleteAsset);
  const canDeleteAsset = useSceneStore((s) => s.canDeleteAsset);
  const createObjectOfType = useSceneStore((s) => s.createObjectOfType);
  const renameAsset = useSceneStore((s) => s.renameAsset);
  // UX repair pass: duplicate-asset action + search filter + delete
  // feedback that names the referencing units.
  const duplicateAsset = useSceneStore((s) => s.duplicateAsset);
  // Subscribed so delete-guard tooltips refresh when units are placed/removed.
  const activeScene = useSceneStore((s) => s.scene);
  const inactiveScenes = useSceneStore((s) => s.inactiveScenes);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  // Inline asset rename (double-click the name): null = not editing.
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetNameDraft, setAssetNameDraft] = useState('');
  // Folder-import tag defaults (overridden per-file by filename heuristics).
  const [defaultFaction, setDefaultFaction] = useState<Faction>('red');
  const [defaultCategory, setDefaultCategory] = useState<AssetCategory>('Infantry');

  const ordered = Object.values(assets);

  // Search filter: case-insensitive substring on the asset name.
  const [query, setQuery] = useState('');
  const visible =
    query.trim() === ''
      ? ordered
      : ordered.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()));

  /**
   * Display names of every object (across ALL scenes) that references the
   * given asset — surfaced on the disabled Delete button so "in use" is
   * actionable instead of a dead end. The map counts as a referencer too.
   */
  const referencingNames = (assetId: string): string[] => {
    const names: string[] = [];
    const collect = (sc: {
      mapAssetId?: string | null;
      objects: Record<string, { name?: string; label?: string; type: string; id: string; assetId?: string }>;
    }) => {
      if (sc.mapAssetId === assetId) names.push('the map');
      for (const o of Object.values(sc.objects)) {
        if (o.assetId === assetId) {
          names.push(o.name ?? o.label ?? `${o.type} · ${o.id.slice(-4)}`);
        }
      }
    };
    collect(activeScene);
    for (const sc of Object.values(inactiveScenes)) collect(sc);
    return names;
  };

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

  /**
   * Folder import: each file becomes a sprite asset. The faction/category
   * default pickers set the baseline; a filename prefix `^(red|blue|neutral)[-_]`
   * overrides the faction, and a category keyword (cavalry/infantry/archers/
   * elephant/commander/banner/weapon) overrides the category. The whole batch
   * is registered as ONE undoable transaction via `registerAssets`.
   */
  const onPickFolder = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same folder
    if (files.length === 0) return;
    setError(null);
    // webkitdirectory ignores `accept`, so a folder can contain non-image
    // files. Resolve each independently and NEVER let one rejector blow up the
    // whole batch (REV-PASS FIX #2): collect the good assets and warn once
    // about the skipped filenames.
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const lower = f.name.toLowerCase();
        const fm = /^(red|blue|neutral)[-_]/i.exec(lower);
        const faction: Faction = fm
          ? (fm[1].toLowerCase() as Faction)
          : defaultFaction;
        let category: AssetCategory = defaultCategory;
        const keywords: Array<[string, AssetCategory]> = [
          ['cavalry', 'Cavalry'],
          ['infantry', 'Infantry'],
          ['archer', 'Archers'],
          ['elephant', 'Elephants'],
          ['commander', 'Commanders'],
          ['banner', 'Banners'],
          ['weapon', 'Weapons'],
        ];
        for (const [kw, cat] of keywords) {
          if (lower.includes(kw)) {
            category = cat;
            break;
          }
        }
        return importAssetFromFile(f, {
          kind: 'sprite',
          category,
          faction,
          name: f.name,
        });
      })
    );
    const successful: import('../scene/types').Asset[] = [];
    const skipped: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') successful.push(r.value);
      else skipped.push(files[i].name);
    });
    if (skipped.length > 0) {
      // One consolidated warning listing every file we could not import.
      console.warn(
        `Folder import skipped ${skipped.length} file(s): ${skipped.join(', ')}`
      );
    }
    // Register whatever succeeded as ONE undoable transaction (a single
    // history entry for the whole batch). If nothing succeeded, do nothing.
    if (successful.length > 0) {
      useSceneStore.getState().registerAssets(successful);
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
        <button
          type="button"
          data-testid="import-folder-btn"
          onClick={() => folderRef.current?.click()}
        >
          Import Folder…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onPick}
        />
        <input
          ref={(el) => {
            folderRef.current = el;
            // `webkitdirectory` is a widely-supported directory-picker
            // attribute but is not in @types/react, so set it imperatively.
            if (el) {
              (el as unknown as { webkitdirectory: boolean }).webkitdirectory = true;
            }
          }}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          data-testid="import-folder"
          onChange={onPickFolder}
        />
      </div>

      <div className="assets-folder-defaults">
        <label>
          Default faction{' '}
          <select
            data-testid="default-faction"
            value={defaultFaction}
            onChange={(e) => setDefaultFaction(e.target.value as Faction)}
          >
            <option value="red">red</option>
            <option value="blue">blue</option>
            <option value="neutral">neutral</option>
          </select>
        </label>
        <label>
          Default category{' '}
          <select
            data-testid="default-category"
            value={defaultCategory}
            onChange={(e) =>
              setDefaultCategory(e.target.value as AssetCategory)
            }
          >
            {[...UNIT_CATEGORIES, 'Markers'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="assets-error">{error}</div>}

      <input
        type="text"
        className="asset-search"
        data-testid="asset-search"
        placeholder="Search assets…"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="assets-list">
        {ordered.length === 0 && (
          <div className="assets-empty">No assets yet — import an image.</div>
        )}
        {visible.length === 0 && ordered.length > 0 && (
          <div className="assets-empty">No assets match “{query}”.</div>
        )}
        {visible.map((asset) => {
          const removable = canDeleteAsset(asset.id);
          const refs = removable ? [] : referencingNames(asset.id);
          return (
            <div
              key={asset.id}
              className="asset-card"
              data-testid={`asset-${asset.id}`}
              draggable
              onDragStart={(e: DragEvent<HTMLDivElement>) => {
                e.dataTransfer.setData(ASSET_DND_MIME, asset.id);
                // Unit-category sprites drop as units; everything else as markers.
                e.dataTransfer.setData(
                  'text/plain',
                  isUnitAsset(asset) ? 'unit' : 'marker'
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
              title={asset.name}
            >
              <img className="asset-thumb" src={asset.src} alt={asset.name} />
              <div className="asset-meta">
                {editingAssetId === asset.id ? (
                  <input
                    type="text"
                    autoFocus
                    spellCheck={false}
                    data-testid={`asset-rename-${asset.id}`}
                    value={assetNameDraft}
                    onChange={(e) => setAssetNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')
                        (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingAssetId(null);
                    }}
                    onBlur={() => {
                      renameAsset(asset.id, assetNameDraft);
                      setEditingAssetId(null);
                    }}
                  />
                ) : (
                  <span
                    className="asset-name"
                    title={`${asset.name} — double-click to rename`}
                    onDoubleClick={() => {
                      setEditingAssetId(asset.id);
                      setAssetNameDraft(asset.name);
                    }}
                  >
                    {asset.name}
                  </span>
                )}
                <span className="asset-kind">{asset.kind}</span>
              </div>
              <button
                type="button"
                data-testid={`place-unit-${asset.id}`}
                onClick={() => {
                  // Place the sprite as a UNIT at the map centre, carrying its
                  // faction metadata, then select it everywhere (canvas + timeline).
                  const id = createObjectOfType('unit', {
                    assetId: asset.id,
                    faction: asset.metadata?.faction,
                    x: worldSize.w / 2,
                    y: worldSize.h / 2,
                  });
                  selectObjectUnified(id);
                }}
              >
                Place as unit
              </button>
              <button
                type="button"
                data-testid={`duplicate-asset-${asset.id}`}
                title="Duplicate asset — same image, new independent library entry"
                onClick={() => duplicateAsset(asset.id)}
              >
                Duplicate
              </button>
              <button
                type="button"
                data-testid={`delete-asset-${asset.id}`}
                disabled={!removable}
                title={
                  removable
                    ? 'Delete asset'
                    : `In use by ${refs.length} object(s): ${refs
                        .slice(0, 3)
                        .join(', ')}${refs.length > 3 ? '…' : ''}`
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

export default AssetsPanel;
