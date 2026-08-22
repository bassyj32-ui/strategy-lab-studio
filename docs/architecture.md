# Architecture — Strategy Lab Internal Studio

> Status: MVP-1 (P0) build. Requirements frozen from PRD v1.0 (§1–§117).
> This document is the single architectural reference. If it conflicts with
> code, the code is wrong until this document is updated via a decision entry.

## 1. Product identity

A **deterministic, commander-controlled 2D/2.5D battlefield animation editor**.
It is **NOT an AI video generator**. The creator is the absolute commander.
CapCut/DaVinci own final filmmaking — we stop at exported deterministic footage.

## 2. Stack (confirmed for MVP-1)

| Concern | Choice |
|---|---|
| Language | React + TypeScript (strict) |
| Canvas scene-graph | **react-konva** (PixiJS is the alternative; decision pending final confirmation) |
| State | **Zustand + Immer** — transactional, undoable |
| Rendering | **Remotion + FFmpeg** (ONLY path) |
| Cloud (optional, P3) | Supabase — auth / scene backup / sync only; core runs without it |
| Package manager | **npm** (`npm run check`) |

## 3. The scene model is the single source of truth

One normalized scene data structure is read by **all** of:

- the editor canvas (live preview)
- the AI Commander (via summarized state + tool calls)
- save / load (serialized scene)
- Remotion rendering (drives frames deterministically)

There is **no second, incompatible representation**. Preview, save, and render
are three *views* of one model — never three copies that can drift.

### Scene model shape (MVP-1, skeletal)

```
Scene {
  id, name, worldSize { w, h }, mapAssetId?
  assets:    Record<AssetId, Asset>        // imported images/maps, never mutated
  objects:   Record<ObjId, SceneObject>   // unit/arrow/shape with unique id
  layers:    Layer[]                        // ordering + visibility
  keyframes: Record<ObjId, Keyframe[]>      // transform over time
  camera:    CameraState                    // lives in world space
  timeline:  { duration, fps }
}
SceneObject { id, type, assetId?, transform {x,y,rotation,scale,opacity}, layerId }
Keyframe    { time, transform }
CameraState{ x, y, zoom, rotation? }
```

## 4. The three layers that must never merge

1. **ASSETS** — raw imported files (maps, unit sprites). Source files are
   immutable. Never bake tactical meaning into them.
2. **ANIMATION** — transforms + keyframes applied to objects over time.
3. **RENDERING** — the deterministic pixel output (Remotion + FFmpeg).

Tactical objects are **placed and animated**, never burned into the map image
or into the exported video frames directly.

## 5. Object identity & non-destructive editing

- Every battlefield object has a **unique ID** and stays independently editable
  after placement and after animation.
- Editing stores `Asset + Transform + Animation`. Source asset files are never
  modified (non-destructive).
- World coordinates are per-map; the camera lives in world space.

## 6. MVP-1 module map (proposed file layout)

```
src/
  scene/            # scene model types + Zustand store (single source of truth)
    types.ts        # Scene, Asset(+§44 metadata), Transform, etc.
    store.ts        # Zustand+Immer, undoable transactions (+ asset registry actions)
  assets/           # ASSETS layer (PRD §4) — immutable source-asset registry + import
    types.ts        # AssetCategory, Faction, AssetMetadata, ImportOptions
    import.ts       # file -> Asset pipeline (portable data: URL, export-safe)
    registry.ts     # immutable registry ops on scene.assets (register/get/replace)
    index.ts        # re-exports
  canvas/           # react-konva stage, layers, object rendering, camera wiring
  objects/          # object system: create/move/transform/scale/opacity
  timeline/         # keyframes, playback clock, scrubbing
  camera/           # world-space camera math + interactive pan/zoom
  render/           # Remotion composition (preview + headless export), canonical interpolate
  ui/               # panels (palette, inspector, layers), preview player
```

**Rule:** battlefield objects are canvas (konva) nodes, never ordinary React DOM
elements. UI panels are React DOM; the battlefield is not.

## 6.1 Asset module (ASSETS layer — this scope only)

Scope: importing maps and assets + the immutable asset registry. Canvas, timeline, camera, render, object placement, AI, and all P1–P3 are OUT (see §9).

Per §3, the asset registry is a **slice of the single scene store** (`scene.assets: Record<AssetId, Asset>`). There is no second, competing asset store. Importing/registering only ever writes into that slice.

### Type design (extends `src/scene/types.ts`; backward-compatible)
```ts
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
  defaultShadow?: boolean;    // §44 metadata ONLY — renderer ignores in MVP-1 (P1)
}
export interface Asset {
  id: AssetId;
  kind: AssetKind;
  name: string;
  src: string;                // portable data: URL from import; never rewritten
                              // (legacy blob: URLs tolerated on read but cannot export)
  width: number;             // intrinsic px; immutable
  height: number;            // intrinsic px; immutable
  metadata?: AssetMetadata;  // optional (maps may not carry category/faction)
}
```

### API design (signatures only)
`src/assets/types.ts`
```ts
export type { Asset, AssetId, AssetKind, AssetCategory, Faction, AssetMetadata } from '../scene/types';
export interface ImportAssetOptions {
  kind: Extract<AssetKind, 'sprite' | 'image'>;
  category?: AssetCategory; faction?: Faction; name?: string;
}
export interface ImportMapOptions { name?: string; }
```
`src/assets/import.ts` (pure, no store, never touches the file)
```ts
export function generateAssetId(kind: AssetKind): AssetId;
export function readImageDimensions(src: string): Promise<{ width: number; height: number }>;
export function importAssetFromFile(file: File, opts: ImportAssetOptions): Promise<Asset>;
export function importMapAsset(file: File, opts?: ImportMapOptions): Promise<Asset>; // kind = 'map'
```
`src/assets/registry.ts` (uses `useSceneStore`)
```ts
export function registerAsset(asset: Asset): void;
export function importMap(file: File, opts?: ImportMapOptions): Promise<void>;
export function replaceAsset(oldId: AssetId, file: File, opts?: ImportAssetOptions): Promise<AssetId>; // registers NEW, returns id; re-pointing deferred
export function getAsset(id: AssetId): Asset | undefined;
export function getMapAsset(): Asset | undefined;
```

### Behavior rules
- `importAssetFromFile` / `importMapAsset` return an `Asset` but DO NOT write to the store (single responsibility; testable in isolation).
- `registerAsset` inserts under `asset.id` only. IDs are unique (UUID), so it is effectively a no-overwrite insert.
- `importMap` = `importMapAsset` → `registerAsset` → set `scene.mapAssetId` AND `scene.worldSize = { w: map.width, h: map.height }` (world coords per map, §5). One active map per scene; the previous map asset is RETAINED in `scene.assets`, not deleted.
- `replaceAsset` registers a NEW asset and returns its id; it does NOT mutate the old asset and does NOT re-point `SceneObject.assetId` (object-system's job, deferred). Marked optional/stub for MVP-1 UI.

### Asset immutability contract
Once an `Asset` is registered in `scene.assets`, its source fields — `id`, `kind`, `name`, `src`, `width`, `height`, and `metadata` — are **never mutated in place**. All registry writes are additive: `registerAsset` only inserts under a freshly generated id; `importMap` only inserts a new map asset and points `scene.mapAssetId` at it (the prior map asset stays byte-for-byte intact). Visual edits (position, rotation, scale, opacity, keyframes) live exclusively on `SceneObject` and `keyframes`, never on the `Asset`. When an asset must change, the system registers a NEW `Asset` and re-points references via `replaceAsset`; the old `Asset` remains unaltered so prior scene state stays valid. This enforces non-destructive editing (PRD §4, §43, §109) and single-source-of-truth (§3).

### Scope boundary (this section only)
IN: type extension, `assets/types.ts`, `assets/import.ts`, `assets/registry.ts`, `assets/index.ts`, store asset actions, map-import wiring (`mapAssetId` + `worldSize`), non-destructive data-URL import, vitest unit tests.
OUT: canvas/konva rendering, timeline, keyframes, camera, Remotion/FFmpeg render, object placement/drag-onto-canvas, project-system UI, asset-library browser UI, categories UI. P1–P3 (formations, arrows, banners, scene system, shadows-rendering, 2.5D, parallax, effects, AI Commander) excluded. `defaultShadow` is stored metadata only, NOT rendered in MVP-1.

### 6.2 Timeline module (MVP-1)

Owns keyframes, playback, and scrubbing only. It does NOT own scene data.

- **Scene = source of truth for keyframes.** `scene.keyframes: Record<ObjId, Keyframe[]>` and `scene.timeline: { duration, fps }` are the only place keyframe data lives. All keyframe edits go through `useSceneStore` actions: `addKeyframe`, `setKeyframeAtTime`, `updateKeyframe`, `removeKeyframe`. Keyframe identity within an object is its `time` (kept unique + array sorted ascending). These mutations funnel through the store's transaction path so they become undoable once undo/redo land.
- **Playback state is TRANSIENT editor state, never saved in the scene.** It lives in `timeline/playbackStore.ts` (separate Zustand store): `currentTime`, `isPlaying`, `loop`, `snapToFrame`, plus a `duration`/`fps` mirror synced from the scene. It is intentionally excluded from save/load and Remotion input.
- **Deterministic interpolation (canonical: `render/interpolate.ts`).** Pure function `interpolateTransform(keyframes, time, base)`. Zero keyframes → `base`. Before first / after last → HOLD (clamp to nearest keyframe). Between two keyframes: `linear` (default) or `hold` (step). `x,y,scale,opacity` linear; `rotation` uses shortest-path angular lerp (normalized to [-180,180]). No bezier / easing curves in MVP-1. `timeline/interpolate.ts` is a pure delegation shim re-exporting the canonical module — there is exactly ONE implementation in the repo.
- **Single consumption path.** Both the live canvas preview and the Remotion render call the same pure selector `getObjectTransformAtTime(scene, objId, time)` — no second representation. Canvas subscribes to playback time via `usePlaybackTime()`; it is not implemented inside timeline/.
- **Playback engine (`usePlaybackEngine`).** One `requestAnimationFrame` loop, active only while `isPlaying`, advancing `currentTime` by real deltas. Respects `duration` and `fps`; auto-stops at end unless `loop`; optional frame snapping.
- **Scrubbing.** `Ruler` maps time→x; click/drag seeks (clamped to [0,duration]). Keyframe diamonds are clickable to select (timeline-local `selection.ts`).
- **UI (React DOM).** `TimelinePanel` composes `TransportControls`, `Ruler` (+Playhead), per-object `KeyframeTrack`, and `KeyframeEditor` (add/update/remove at the selected time). Selection of which object/keyframe is shown is timeline-local state in `timeline/selection.ts`, not scene data.

## 7. Rendering boundary

Rendering runs **outside the web request lifecycle**. The editor triggers a
render job; the job (Remotion + FFmpeg) produces deterministic MP4 footage.
Never block the editor thread on 1080p/4K render.

### 7.1 The render module (`src/render/`)

The render layer is a **self-contained module** that owns the only sanctioned
pixel-output technique for MVP-1:

- **Technique = self-contained `<canvas>` 2D.** Each frame is painted onto a
  single `<canvas>` via its 2D context inside the Remotion `BattleScene`
  component. We do **NOT** reuse the `canvas/` react-konva stage for rendering,
  and we do **NOT** render per-object DOM. This satisfies architecture law
  §83 (battlefield objects are not ordinary React DOM) and keeps the render
  path deterministic and synchronous — no async race between object paints.
- **Single source of truth, two consumers.** The *same* `BattleScene` component
  (and the same pure functions `interpolateTransform` → `applyCamera` →
  `drawScene`) is consumed by:
  1. the in-editor live preview (`PreviewPlayer` wrapping Remotion `<Player>`),
  2. the headless `remotion render src/render/index.ts BattleScene --props=...`.
  There is no second, divergent frame-builder. Preview and export are two
  *views* of one render module (per §3).
- **Per-frame determinism.** `drawScene(ctx, scene, frame, fps, videoSize,
  images)` is a pure, READ-ONLY function: it never mutates the scene, its
  keyframes, the asset map, or the camera. Interpolation is LINEAR and clamped
  at the ends (`interpolateTransform`); the camera projection is a pure math
  pass (`applyCamera`); identical `(scene, frame)` always paint byte-identical
  pixels. The same scene + same timeline = stable output across runs (per
  `rendering.md` §2).
- **Outside the lifecycle.** The `<Player>` preview runs its own non-blocking
  RAF loop; the headless render is a job invoked by Remotion (FFmpeg encodes
  deterministically). The editor never blocks on a 1080p/4K render (PRD §68).
- **No baking.** Tactical objects are painted as canvas nodes each frame on top
  of the (unchanged) map image. Objects are never burned into the source map
  and never into the exported frames directly (architecture §4, `rendering.md`
  §4).

## 8. AI boundary (P3, but rules enforced now)

- AI acts only through approved tool calls on structured scene data.
- AI receives a **summarized** scene state — never hundreds of raw objects.
- AI **never** renders, never overwrites keyframes without approval, never
  decides historical truth.
- (Full AI layer is MVP-3 / P3 — not built in MVP-1.)

## 9. Scope discipline

Build **P0 / MVP-1** only. Do **not** pull P1–P3 features forward (formations,
bezier paths, arrows, banners, 2.5D, parallax, AI Commander, etc.) unless the
owner explicitly asks. No SaaS infra (billing / signup / teams / marketplace).
