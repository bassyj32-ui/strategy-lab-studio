import { useSceneStore } from '../scene/store';
import type {
  Asset,
  AssetId,
  ImportAssetOptions,
  ImportMapOptions,
} from './types';
import { importAssetFromFile } from './import';

/**
 * Inserts an asset into the single-scene asset registry (additive only).
 * Does not mutate the passed asset object in place.
 */
export function registerAsset(asset: Asset): void {
  useSceneStore.getState().registerAsset(asset);
}

/**
 * Imports a map file, registers it, and points `scene.mapAssetId` + derives
 * `scene.worldSize` from the map dimensions. The previous map asset is retained
 * in `scene.assets` (one active map per scene, but never deleted).
 */
export async function importMap(
  file: File,
  opts?: ImportMapOptions,
): Promise<void> {
  await useSceneStore.getState().importMap(file, opts);
}

/**
 * Registers a NEW asset from a file and returns its id. Does NOT mutate the old
 * asset and does NOT re-point `SceneObject.assetId` (object-system's job,
 * deferred to a later milestone).
 */
export async function replaceAsset(
  _oldId: AssetId,
  file: File,
  opts?: ImportAssetOptions,
): Promise<AssetId> {
  const newAsset = await importAssetFromFile(file, opts ?? { kind: 'sprite' });
  registerAsset(newAsset);
  return newAsset.id;
}

/** Reads an asset from the scene registry. */
export function getAsset(id: AssetId): Asset | undefined {
  return useSceneStore.getState().scene.assets[id];
}

/** Reads the currently-active map asset, if any. */
export function getMapAsset(): Asset | undefined {
  const { scene } = useSceneStore.getState();
  return scene.mapAssetId ? scene.assets[scene.mapAssetId] : undefined;
}
