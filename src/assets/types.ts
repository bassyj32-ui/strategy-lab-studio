import type { AssetKind, AssetCategory, Faction } from '../scene/types';

export type {
  Asset,
  AssetId,
  AssetKind,
  AssetCategory,
  Faction,
  AssetMetadata,
} from '../scene/types';

export interface ImportAssetOptions {
  kind: Extract<AssetKind, 'sprite' | 'image'>;
  category?: AssetCategory;
  faction?: Faction;
  name?: string;
}

export interface ImportMapOptions {
  name?: string;
}
