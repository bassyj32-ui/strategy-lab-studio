export type AssetId = string;
export type ObjId = string;
export type LayerId = string;

export interface Vec2 {
  x: number;
  y: number;
}

export interface WorldSize {
  w: number;
  h: number;
}

export type AssetKind = 'map' | 'sprite' | 'image';

export type AssetCategory =
  | 'Infantry' | 'Cavalry' | 'Archers' | 'Elephants'
  | 'Commanders' | 'Banners' | 'Weapons' | 'Arrows'
  | 'Markers' | 'Highlights' | 'Effects' | 'Terrain' | 'Labels';

export type Faction = 'red' | 'blue' | 'neutral';

export interface AssetMetadata {
  aspectRatio: number;        // width / height, derived at import (immutable)
  defaultScale: number;       // suggested placement scale, 1 = 100%
  category?: AssetCategory;   // §44; maps usually omit
  faction?: Faction;          // §44; metadata only
  defaultShadow?: boolean;    // §44 metadata ONLY — NOT rendered in MVP-1
}

export interface Asset {
  id: AssetId;
  kind: AssetKind;
  name: string;
  src: string;                // object URL (blob:) or data URL; never rewritten
  width: number;              // intrinsic px; immutable
  height: number;             // intrinsic px; immutable
  metadata?: AssetMetadata;   // optional (maps may not carry category/faction)
}

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
}

export type SceneObjectType = 'unit' | 'shape' | 'marker';

export interface SceneObject {
  id: ObjId;
  type: SceneObjectType;
  assetId?: AssetId;
  transform: Transform;
  layerId: LayerId;
}

export interface Keyframe {
  time: number;
  transform: Transform;
}

export type Keyframes = Record<ObjId, Keyframe[]>;

export interface Layer {
  id: LayerId;
  name: string;
  visible: boolean;
  order: number;
}

export interface CameraState {
  /** World X shown at the viewport centre (camera lives in world space, PRD §87). */
  x: number;
  /** World Y shown at the viewport centre. */
  y: number;
  /** Multiplicative zoom. Editor clamp: [MIN_ZOOM, MAX_ZOOM] = [0.1, 8]. */
  zoom: number;
  /**
   * Camera rotation, CANONICAL UNIT: RADIANS (see camera/cameraMath.ts).
   * MVP-1 freezes this at 0/undefined — no UI exposes it yet.
   * NOTE: object `Transform.rotation` is DEGREES (Konva convention); the two
   * fields intentionally use different units. Convert only at a render
   * boundary. Known dormant gap: src/render/camera.ts currently assumes
   * degrees — harmless while rotation is always 0, must be reconciled before
   * any non-zero camera rotation ships (docs/decisions.md, 2026-08-22).
   */
  rotation?: number;
}

export interface Timeline {
  duration: number;
  fps: number;
}

export interface Scene {
  id: string;
  name: string;
  worldSize: WorldSize;
  mapAssetId?: AssetId;
  assets: Record<AssetId, Asset>;
  objects: Record<ObjId, SceneObject>;
  layers: Layer[];
  keyframes: Keyframes;
  camera: CameraState;
  timeline: Timeline;
}
