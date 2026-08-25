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

/**
 * §50 EFFECT SYSTEM (P2): optional procedural overlays painted around an
 * object by BOTH render doors. Purely deterministic (functions of time only —
 * no randomness), tactical-clarity-first per PRD §50. `fade` is already
 * expressible through opacity keyframes and `blur` needs codec-risky canvas
 * filters, so neither is a stored effect kind; vignette lives on Scene.
 */
export type EffectKind = 'smoke' | 'dust' | 'impact' | 'fire' | 'glow';

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
 * §32 SIGNATURE ARROWS (P2 branding): reusable tactical arrow styles. Each
 * style fixes thickness / arrowhead / opacity / dash so the visual language
 * stays consistent across a project (see objects/arrowStyles.ts for specs).
 * Absent = the default 'attack' look (byte-identical to pre-branding arrows).
 */
export type ArrowStyle =
  | 'attack'
  | 'flank'
  | 'retreat'
  | 'encirclement'
  | 'movement'
  | 'charge';

/**
 * §93 BRANDING SYSTEM: per-scene brand metadata. Purely descriptive — text
 * feeds the §95 signature opening card and factionColors overrides let
 * historical accuracy demand non-default army colors (§31).
 */
export interface BrandConfig {
  /** Battle display name, e.g. 'CANNAE'. Falls back to Scene.name. */
  battleName?: string;
  /** Date line, e.g. '216 BC'. */
  dateLine?: string;
  /** Faction color overrides merged over the §31 defaults. */
  factionColors?: Partial<Record<Faction, string>>;
}

/**
 * §95/§96 TITLE CARD config (signature opening / ending). Presence on Scene =
 * enabled. Rendered as a deterministic full-frame overlay pass by BOTH render
 * consumers of drawScene (Remotion preview + export); skipped in alpha mode.
 * Text defaults flow from BrandConfig; per-card fields override.
 */
export interface TitleCardConfig {
  /** Small top line, e.g. 'STRATEGY LAB'. */
  kicker?: string;
  /** Main display-font line, e.g. battle name or 'THE LESSON'. */
  title?: string;
  /** Secondary line under the title, e.g. '216 BC'. */
  subtitle?: string;
  /** Window START (seconds). Opening default 0; closing defaults to end-of-timeline. */
  startAt?: number;
  /** Full window length (seconds) including fades. Default 3. */
  duration?: number;
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
   * ARROW-ONLY (§32 branding): signature style fixing thickness/head/opacity/
   * dash. Absent = 'attack' (the original geometry).
   */
  arrowStyle?: ArrowStyle;
  /** §50 EFFECT SYSTEM: optional procedural overlay (see EffectKind). */
  effect?: EffectKind;
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
  /**
   * EDITABLE DISPLAY NAME (UX repair pass): human identity used by the
   * timeline tracks, Inspector, and AI Commander NL resolution. Absent =
   * surfaces as "type · short-id". Pure metadata — never affects animation.
   */
  name?: string;
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
 * TEMPORAL EASING vocabulary (PRD §112 P0 "basic easing"). Canonical
 * definition lives HERE (scene model owns its data vocabulary);
 * render/interpolate.ts re-exports it. `hold` = step (no movement inside the
 * segment), the others map linear progress through a quadratic ease curve.
 */
export type Easing = 'hold' | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

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
  /**
   * TEMPORAL EASING (PRD §112 P0 "basic easing") for the segment STARTING at
   * this keyframe. Absent = 'linear', so pre-easing scenes stay byte-identical.
   * Applied to ALL channels of the segment (position follows its eased path).
   */
  easing?: Easing;
}

export type Keyframes = Record<ObjId, Keyframe[]>;

export interface Layer {
  id: LayerId;
  name: string;
  visible: boolean;
  order: number;
  /**
   * PARALLAX DEPTH (PRD §46, P2): 0 = layer pinned to the map plane (does not
   * move with the camera), 1 = full camera speed (default; absent behaves as
   * 1, so scenes without this field render byte-identically to before).
   * In-between values slide proportionally slower — instant 2.5D depth.
   */
  depthFactor?: number;
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
  /**
   * §93 BRANDING: per-scene brand metadata (battle name / date line / faction
   * color overrides). Purely descriptive; feeds the title cards and both
   * render doors' faction ring colors.
   */
  brand?: BrandConfig;
  /**
   * §95 SIGNATURE OPENING card. Absent = disabled. Rendered by the shared
   * drawScene overlay pass (preview + export); skipped in alpha mode.
   */
  openingCard?: TitleCardConfig;
  /** §96 SIGNATURE ENDING space ('THE LESSON'). Same mechanism as openingCard. */
  closingCard?: TitleCardConfig;
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
