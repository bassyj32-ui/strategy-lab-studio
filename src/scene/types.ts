export type AssetId = string;
export type ObjId = string;
export type LayerId = string;
export type SceneId = string;

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
  defaultShadow?: boolean;    // §44 + §3c: fixed soft shadow in render AND editor preview
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

/**
 * 'group' is an ORGANIZATIONAL node (P1 pull-forward, owner-approved): it has
 * a transform and can be keyframed like any object, but it is never painted
 * itself — its children render relative to it. It is not in the palette.
 */
export type SceneObjectType = 'unit' | 'shape' | 'marker' | 'arrow' | 'group';

/** Formation layouts supported by `createFormation` (pure layout math in objects/groups.ts). */
export type FormationPattern = 'line' | 'column' | 'wedge' | 'grid';

/**
 * Formation metadata stored on the PARENT group node only. Purely descriptive
 * (what pattern spawned the children); children remain independently editable
 * afterwards (PRD §8) — editing a child never rewrites this metadata.
 */
export interface FormationMetadata {
  pattern: FormationPattern;
  /** Local-units gap between adjacent members. */
  spacing: number;
  /** Number of child members spawned (excludes the group parent). */
  count: number;
}

export interface SceneObject {
  id: ObjId;
  type: SceneObjectType;
  assetId?: AssetId;
  transform: Transform;
  layerId: LayerId;
  /**
   * PARENT LINK (groups, P1 pull-forward): when set, `transform` is LOCAL —
   * expressed relative to the parent's world transform (compose rules in
   * objects/groups.ts). Objects without parentId are roots: local == world.
   */
  parentId?: ObjId;
  /** FORMATION-ONLY: set on the parent group node created by createFormation. */
  formation?: FormationMetadata;
  /**
   * ARROW-ONLY: shaft length in LOCAL units (tail at local origin, tip at
   * (length, 0)). Placement/orientation live entirely in `transform`, so
   * arrows animate through the standard keyframe machinery like any object.
   */
  length?: number;
  /** ARROW-ONLY: explicit stroke color; renderers fall back to their default. */
  color?: string;
  /**
   * DEPTH (PRD §48): optional z-order within the layer. Higher renders later
   * (on top); absent behaves as 0 with stable insertion order preserved.
   */
  z?: number;
  /**
   * COMMANDER MARKER (P2 §36): display name painted UNDER the object by both
   * render doors. Purely descriptive — never affects animation math.
   */
  label?: string;
  /** COMMANDER MARKER: faction ring drawn AROUND the object (PRD §31 colors). */
  faction?: Faction;
  /**
   * HISTORICAL CONFIDENCE (P2 §37): optional restrained badge ABOVE the
   * object. Absent = no badge (fully opt-in per PRD).
   */
  confidence?: ConfidenceLevel;
}

/** Historical-confidence vocabulary (PRD §37). `undefined` = no badge. */
export type ConfidenceLevel = 'confirmed' | 'probable' | 'disputed';

/**
 * Bezier control-point OFFSET relative to the owning keyframe's transform
 * position (world units). Stored as deltas so moving a keyframe keeps its
 * handle shape. Absent on BOTH ends of a segment = LINEAR movement
 * (byte-identical to pre-curve behavior).
 */
export interface ControlPoint {
  dx: number;
  dy: number;
}

export interface Keyframe {
  time: number;
  transform: Transform;
  /** OUT handle for the segment STARTING at this keyframe (P1 of the cubic). */
  cpOut?: ControlPoint;
  /** IN handle for the segment ENDING at this keyframe (P2 of the cubic). */
  cpIn?: ControlPoint;
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

/**
 * One keyframe on the per-scene CAMERA track. `cam` stores the view (world
 * centre + zoom + optional rotation). Like object Keyframes there is NO
 * stored easing field: segments are LINEAR, boundaries HOLD (see
 * timeline/cameraTrack.ts).
 */
export interface CameraKeyframe {
  time: number;
  /**
   * The view stored at this key. `rotation` (RADIANS, canonical) is OPTIONAL
   * so pre-rotation tracks stay valid; absent values fall back to the live
   * base `Scene.camera.rotation` at evaluation time.
   */
  cam: Pick<CameraState, 'x' | 'y' | 'zoom'> & { rotation?: number };
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
  /**
   * OPTIONAL animated camera path. Absent/empty = camera is a static
   * navigation state (`camera` above) and behaviour is byte-identical to
   * pre-track scenes. When present, playback/preview/export evaluate it via
   * getCameraAtTime while `camera` remains the live editing base.
   */
  cameraTrack?: CameraKeyframe[];
  /**
   * OPTIONAL cinematic edge-darkening (P2 "Decisive Move", PRD §38). Purely
   * a presentation flag: painted as a deterministic radial gradient in the
   * export AFTER objects (never baked into assets) and mirrored as a CSS
   * overlay in the editor. Skipped in alpha mode (objects-only output).
   */
  vignette?: boolean;
  timeline: Timeline;
}

// ---------------------------------------------------------------------------
// Multi-scene project envelope (ADDITIVE ONLY — `Scene` above is untouched).
// ---------------------------------------------------------------------------

/**
 * Bump on breaking changes to the save format (see `loadProject`).
 * 1 → 2 (2026-09-03): assets are now a PROJECT-SCOPED library. Old v1 files
 * store assets per-scene; on load they are transparently migrated by
 * `migrateProjectV1ToV2` (every scene inherits the union of all scenes'
 * assets, so imports made in any scene become visible everywhere). See
 * docs/decisions.md for the rationale behind the mirror approach.
 */
export const PROJECT_SCHEMA_VERSION = 2;

/**
 * Full-project save format. LAW: we always save the WHOLE project (every
 * scene), never a lone scene — a project file is the unit of persistence.
 * `activeSceneId` must match exactly one entry of `scenes`.
 */
export interface Project {
  schemaVersion: number;
  activeSceneId: string;
  /** Insertion order is preserved and round-trips through save/load. */
  scenes: Scene[];
}
