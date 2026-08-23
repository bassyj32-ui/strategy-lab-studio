# Decisions — Strategy Lab Internal Studio

> Every architectural or scope choice is recorded here with a date and the
> reason. When in doubt, this log is the authority on *why* something is the
> way it is. New decisions go at the TOP (newest first).

## 2026-08-23 — Wave-2 UX integration (owner test-drive feedback) + MVP-2 arrows unfrozen

Scope: three parallel builder sessions (selection sync, timeline usability,
camera clarity) integrated on the shared working tree.

- **Unified object selection:** the scene store (`selectedObjId`) and the
  timeline selection store are kept in sync via `initSelectionSync()` (one-way
  mirror scene → timeline) plus unified select helpers used by `ObjectNode`
  (single canvas choke point) and palette click-to-place. Fixes two reported
  dead-ends: placing a unit left nothing selected, and keyframe controls only
  enabled from timeline-track clicks.
- **Timeline usability:** frame stepping (`stepFrames`/`seekStart`/`seekEnd`),
  panel-scoped keyboard transport (Space / ←→ / Home / End, safe around text
  inputs), fps·duration readout beside the timecode, and a coaching empty
  state naming the keyframing flow.
- **Camera clarity + correctness:** `CameraHud` (zoom % readout, −/+/Reset
  routed through the same clamped `zoomAtPoint`), dismissible navigation hint
  chip (localStorage-persistent), double-click empty canvas = reset view.
  Audit fixes: drop coordinates were measured against the CSS wrapper instead
  of `.konvajs-content`, so objects snapped toward viewport centre at any
  zoom (now cursor-exact); Firefox line-mode wheel deltas are normalized
  (`normalizeWheelDelta`) so zoom speed matches other browsers.
- **Imported maps render on the editing canvas:** `canvas/useMapImage.ts` +
  Konva Image layer. Previously maps loaded only inside the Remotion preview,
  which made Import Map look broken to users even though the store worked.
- **SCOPE CHANGE — owner-approved: MVP-2 arrow annotations UNFROZEN.**
  The P1–P3 freeze (PRD §100, §112) is relaxed for draw-on-map arrow
  annotations that track unit transforms, per explicit owner instruction.
  The spine extension (arrow object type) is integrator-owned. This entry is
  the authority on why the freeze no longer covers this one feature.

## 2026-08-22 — Integration pass (all six module sessions merged)

Scope: cross-session integration on the shared working tree — camera
interactivity restored, export-safe asset import, single playback clock,
determinism re-proof, doc sync.

- **SUPERSEDES the camera removal below:** interactive wheel-zoom-at-cursor and
  background drag-pan are BACK in `CanvasStage`, rebuilt from the surviving,
  fully tested `camera/cameraInteractions.ts` helpers (`wheelDeltaToFactor`,
  `useCameraPan`). The earlier removal was a last-writer-wins artifact of
  parallel sessions sharing one working directory, not a scope decision. A
  `panMovedRef` guard keeps a completed drag-pan from also clearing selection.
- **Asset import produces data: URLs, not object URLs** (supersedes §6.1's
  object-URL wording): `assets/import.ts` encodes bytes via `arrayBuffer()` +
  base64 (no FileReader) so the identical code path runs in browser, node unit
  tests, and headless render. blob: URLs cannot be resolved by the headless
  renderer; data: URLs serialize into scene.json and export fine.
  Non-destructive law unchanged — source files are never modified.
- **One transport clock:** `timeline/playbackStore` is THE editor clock.
  `PreviewPlayer` one-way-mirrors store time into Remotion `<Player>` (seek
  when drifted; play/pause follows store); the Player's native controls are
  removed so TransportControls remains the only transport UI. Headless export
  never reads the clock (frames derive from `--props` input only).
- **Byte-determinism RE-PROVEN post-integration:** three headless renders of a
  fixed scene.json produced identical SHA-256 `f8a52f0e62cf…ffa8cf67` —
  matching the original render-session proof byte-for-byte, i.e. the
  interpolate relocation changed zero output bytes.
- **Hygiene:** `out/` gitignored (render outputs are artifacts);
  architecture.md module map no longer marks canvas/objects/timeline/camera/
  render/ui as [DEFERRED]; frozen docs verified byte-clean vs origin/main.
- Full check green at close of integration: tsc strict / eslint / 107 tests /
  vite build all passing.

## 2026-08-22 — MVP-1 editor session: review fixes + supersessions

Scope shipped this session (boss-approved): canvas, object system, layers,
drag/drop, position/rotation/scale/opacity editing, undo/redo. OUT (seams
only): timeline/keyframes UI work beyond pre-existing seams, camera
interactivity, asset import, Remotion export runs.

- **SUPERSEDES "Camera wired into the editor canvas" (same day):** interactive
  wheel-zoom and background drag-pan were REMOVED from `CanvasStage` as
  out-of-scope pull-forward. Camera remains a SEAM only: static `stageProps`
  positioning + `screenToWorld` drop mapping. `updateCamera` stays non-undoable.
  The radians(editor)/degrees(render) camera-rotation discrepancy note STANDS.
- **SUPERSEDES "Single interpolation path" item in the render entry below
  (inverts it):** the canonical interpolation implementation now lives in
  `src/render/interpolate.ts` (hold easing, shortest-path rotation, boundary
  clamps). `src/timeline/interpolate.ts` is a pure delegation shim re-exporting
  it. Exactly one implementation exists; a canonical-path test suite pins hold +
  rotation-wrap so the two import paths can never diverge again. architecture.md
  §6.2 updated to match.
- **removeLayer law fix (PRD §8):** deleting any layer reassigns its objects AND
  `activeLayerId` to a SURVIVING layer (prefer `DEFAULT_LAYER_ID`, else first by
  draw order). Deleting the last remaining layer is forbidden. No object can
  ever reference a deleted layer. Regression-tested both directions.
- **Editor chrome fully mounted:** App layout = Toolbar (palette) + CanvasStage +
  Inspector + LayersPanel (top row), PreviewPanel + TimelinePanel (bottom row).
  Inspector = numeric transform inputs, ONE undo entry per focus→blur edit
  session, non-finite commits ignored.
- **tsconfig strictness restored repo-wide:** the `"exclude": ["src/render"]`
  carve-out is gone; Remotion `Composition` props typed via a `BattleSceneProps`
  type alias (no `as unknown as` casts in production code).
- **Accepted future-session concerns (non-blocking):** disk-backed/data-URL
  assets still required for real-map exports; camera-rotation unit split must be
  reconciled before non-zero rotation ships; no CSS file yet (inline styles);
  `scenesEqual` uses JSON.stringify (key-order fragile); no-op transactions may
  push history entries.

## 2026-08-22 — Camera wired into the editor canvas (MVP-1)

> **STATUS: partially superseded by the "review fixes + supersessions" entry
> above** — interactive wheel-zoom/drag-pan have since been removed from
> `CanvasStage`; camera is a seam only. The radians/degrees note below stands.

- **Decision:** `CanvasStage` consumes `src/camera/` via `useCamera(worldSize)`:
  `stageProps` spread onto `<Stage>`; wheel zooms cursor-anchored through
  `wheelDeltaToFactor` (`exp(-deltaY·0.0015)`, clamp [0.1, 8]); background-drag
  pans (drags starting on an object stay object moves). The camera **viewport =
  the Stage's pixel space** (`Scene.worldSize`); the CSS 0.5 preview scale sits
  OUTSIDE all camera math — pointer mapping converts client→stage px first.
- **Decision:** Camera is NAVIGATION state, not undoable content:
  `updateCamera` pushes no history AND `undo`/`redo` preserve the live camera
  across snapshot restores, so content edits never teleport the view [PRD §87].
- **Decision:** Canonical unit for `Scene.camera.rotation` is RADIANS
  (`camera/cameraMath.ts`). KNOWN DORMANT DISCREPANCY: `src/render/camera.ts`
  currently interprets it as DEGREES with opposite sign. Equivalent today only
  because rotation is frozen at 0; MUST be reconciled at one boundary before
  any non-zero camera rotation ships. Object `Transform.rotation` stays
  DEGREES (Konva convention) — documented on both types.
- **Also:** `importMap` is now undoable (`pushHistory`) — importing a map
  reinterprets every existing coordinate, so the prior basis must be
  recoverable (no irreversible scene changes).
- **Scope held:** no keyframed camera, presets, 2.5D/parallax, multi-camera,
  AI camera (P1–P3).


## 2026-08-22 — Render technique = self-contained Canvas 2D (MVP-1)

- **Decision:** The render module (`src/render/`) paints each frame onto a
  single self-contained `<canvas>` 2D context inside the Remotion `BattleScene`
  component. It does NOT reuse the `canvas/` react-konva stage and does NOT use
  per-object DOM. The same `BattleScene` is consumed by two paths: the in-editor
  live `@remotion/player` `<Player>` preview and the headless
  `remotion render src/render/index.ts BattleScene --props=...`.
- **Reason:** A synchronous, deterministic sync paint avoids async races between
  object draws, is trivially unit-testable, and is fully decoupled from the
  `canvas/` editor module — while still satisfying architecture law §83
  (battlefield objects are never ordinary React DOM; here they are canvas
  pixels). Interpolation (`interpolateTransform`) and camera projection
  (`applyCamera`) are pure functions, so identical `(scene, frame)` is
  byte-stable.
- **Consequence:** `drawScene` is READ-ONLY w.r.t. the scene (no mutation of
  scene/keyframes/assets/camera — asserted by tests). `Root.tsx` registers
  `BattleScene` with `calculateMetadata` deriving `fps`/`durationInFrames` from
  `scene.timeline`, so one Composition serves both the default scene and a
  `--props=out/scene.props.json` payload of shape `{ "scene": <Scene> }`.
  Export resolution is fixed at 1920×1080 (shared constant `EXPORT_RESOLUTION`
  in `defaultProps.ts`, consumed by `Root.tsx` AND `PreviewPlayer.tsx`). Object
  `x,y` is its CENTER in world coords; camera `x,y` is the view center;
  rotation lerp on the shortest path.
- **Review fix (same day):**
  1. *Asset URL resolution* — `resolveAssetUrl()` passes `blob:`/`data:`/
     `http(s):` URLs through UNCHANGED and only wraps real paths in
     `staticFile()`. Previously every imported asset (which the ASSETS layer
     stores as blob: object URLs) was corrupted to `/blob:...` → guaranteed
     404 → silent placeholder squares in BOTH preview and export.
  2. *Loud failure policy* — failed asset loads warn once per id and draw a
     deterministic red banner; headless export additionally HARD-FAILS
     (`assertExportIntegrity` + `getRemotionEnvironment().isRendering`) when
     the MAP is unloadable, so a "video of colored squares" can never be
     produced silently. Follow-up for the assets session: disk-backed
     (`public/`) or data-URL assets are required for export with real maps.
  3. *Single interpolation path* — deleted `render/interpolate.ts`; render now
     consumes the SAME pure selector as the timeline
     (`timeline/interpolate.interpolateTransform`) per architecture §6.2,
     eliminating preview/export drift (rotation normalization, copy
     semantics). Byte-identical re-render verified post-refactor.
  4. *Commit-ordered capture* — `delayRender`/`continueRender` now continue
     only after the loaded-images state has committed, so headless capture
     cannot screenshot a canvas whose images have not landed.

## 2026-08-22 — Timeline module design (MVP-1)

- **Decision:** Keyframes live ONLY in the scene model (`scene.keyframes`, `scene.timeline`); edited via `useSceneStore` actions (`addKeyframe`, `setKeyframeAtTime`, `updateKeyframe`, `removeKeyframe`). Playback state (`currentTime`, `isPlaying`, `loop`, `snapToFrame`) is TRANSIENT and lives in a separate `timeline/playbackStore.ts` — never saved in the scene, never fed to Remotion.
- **Reason:** Enforces architecture law §3 (scene = single source of truth) and §6 (separate ANIMATION from RENDERING/state). Preview, save, and render must read identical keyframe data.
- **Decision:** Interpolation is a pure deterministic function; MVP-1 supports only HOLD (clamp) and LINEAR. `rotation` uses shortest-path angular lerp; `x,y,scale,opacity` use plain linear lerp. No bezier/easing curves.
- **Reason:** Deterministic, commander-controlled output; shortest-path prevents surprising multi-turn spins while staying trivially testable.
- **Decision:** Keyframe identity within an object = its `time` (unique, array sorted ascending). Playback driven by a single `requestAnimationFrame` loop using real deltas. Canvas consumes timeline via the pure selector `getObjectTransformAtTime` + `usePlaybackTime()` hook (canvas not in scope here).
- **Consequence:** Timeline UI (`TimelinePanel` + children) is React DOM; selection of the active object/keyframe is timeline-local (`timeline/selection.ts`). No P1–P3 features (paths, formations, arrows, 2.5D, AI) are included.

## 2026-08-22 — Asset registry & import design (ASSETS layer, MVP-1)

- **Decision:** Browser import uses `URL.createObjectURL(file)` — the original `File` is never read back or written into; the source stays pristine (PRD §43, §75 local-first). The resulting `Asset.src` is an immutable object URL.
- **Decision:** Registry operations are **additive/immutable**: insert-only under unique UUID ids; existing assets are never mutated in place. `category`, `faction`, `defaultShadow` are stored as *metadata only*, not render behavior.
- **Decision:** The asset registry is a **slice of the single scene store** (`scene.assets`); there is no second asset store (PRD §3).
- **Decision:** **One map per scene** for MVP-1 — `importMap` sets `scene.mapAssetId` and derives `scene.worldSize` from map dims; the previous map asset is retained, not deleted.
- **Decision:** **Replace-by-repoint deferred** to the object layer — `replaceAsset` registers a new asset and returns its id; re-pointing `SceneObject.assetId` is the object-system's concern, not built in MVP-1.
- **Decision:** `kind` kept as `'map' | 'sprite' | 'image'` (no refinement needed for MVP-1). `metadata.aspectRatio` is derived at import; `defaultScale` defaults to 1.
- **Consequence for BUILDER:** `src/assets/{types,import,registry,index}.ts` to be created; `src/scene/types.ts` extended with `AssetMetadata`/`AssetCategory`/`Faction`; `scene/store.ts` gains `registerAsset` + `importMap` actions. No canvas/timeline/camera/render/AI work in this scope.

## 2026-08-22 — Agent system structure locked (MVP-1)

- **Decision:** Build a lean agent set — MAIN (primary) + ARCHITECT + BUILDER +
  REVIEWER. Skip DATABASE / SECURITY / DEPLOYMENT agents until Supabase (P3).
- **Reason:** User's full proposal (MAIN→ARCHITECT/BUILDER/REVIEWER→
  DATABASE/FRONTEND/SECURITY→DEBUGGER→QA) is over-scaled for an MVP-1 solo
  project. DEBUG/QA become skills/loops, not separate agents.
- **Consequence:** DEBUG = `diagnosing-bugs` skill; QA = `testing` skill.
  RENDER/EDITOR agents added in MVP-2+.

## 2026-08-22 — Package manager = npm

- **Decision:** Use **npm**; verification command is `npm run check`
  (typecheck + lint + unit + build).
- **Reason:** Simplest for the internal tool; user approved.

## 2026-08-22 — Agents are project-scoped

- **Decision:** Define agents/commands in `strategy-lab-studio/.opencode/`
  (not global `~/.config/opencode/`).
- **Reason:** Agent definitions belong to this repo's frozen requirements.

## 2026-08-22 — /docs skeleton filled now

- **Decision:** Create `architecture.md`, `decisions.md`, `rendering.md`
  at MVP-1 start (not deferred).
- **Reason:** Knowledge base must exist before coding; `decisions.md` is the
  critical record.

## 2026-08-22 — Freeze protection on requirements

- **Decision:** BUILDER's `edit` permission is **denied** on `docs/prd.md`
  and `AGENTS.md`.
- **Reason:** Requirements are frozen (PRD v1.0). No agent silently changes
  the laws. Pushes to git are also denied for BUILDER.

## 2026-08-22 — "DONE" means green checks

- **Decision:** The PLAN→IMPLEMENT→TEST→DEBUG→REVIEW→DONE loop ends at DONE
  only when `npm run check` is green. "Files written" is not completion.
- **Reason:** Verification over false confidence (user point #4/#5).

## 2026-08-22 — Scope-guard against the 117-requirement trap

- **Decision:** MAIN prompt + AGENTS.md reject any P1–P3 feature pull-forward
  during MVP-1. Build P0 first.
- **Reason:** PRD §117 freeze warning — do not hand the coding agent 117
  requirements at once.

## Stack choices (carried from PRD, confirmed for MVP-1)

- React + TypeScript (strict); react-konva canvas; Zustand + Immer;
  Remotion + FFmpeg rendering. Supabase optional, P3 only.
- Canvas: **react-konva** chosen over PixiJS (final confirmation pending —
  see architecture.md §2). If switched, record a new decision here.

## 2026-08-23 — Animated camera via an OPTIONAL per-scene cameraTrack

- **Decision:** `Scene.cameraTrack?: CameraKeyframe[]` (time + {x,y,zoom};
  rotation NOT animated — MVP-1 freezes it). Evaluation lives in ONE pure
  engine, `src/timeline/cameraTrack.ts::getCameraAtTime` (clamp/HOLD outside
  the range, LINEAR between keys — same semantics as the object
  interpolator). The Remotion render (`draw.ts`) evaluates it per frame; the
  editor stage displays keyed-at-playhead EXCEPT while the user is actively
  navigating (pan/wheel/HUD), when it shows and writes the live base camera
  (400 ms grace window). Store mutations: setCameraKeyframe /
  removeCameraKeyframe / moveCameraKeyframe — one undo step each.
- **Reason:** Camera keyframes are MVP-1 wishlist (PRD §1717). Keeping
  `camera` as the live base preserves today's navigation UX and makes
  zero-keyframe scenes byte-identical to pre-track renders.

## 2026-09-03 — Project-scoped asset library (v1 → v2 schema migration)

- **Decision:** Assets are now PROJECT-scoped, not per-scene. On import
  (`registerAsset` / `importMap` / new `importAsset`) the asset is written
  into EVERY scene's `assets` map — a mirror, so the render pipeline
  (`draw.ts`, `ObjectNode`) keeps reading `scene.assets` unchanged. Assets
  are immutable blob/data URLs, so each scene shares the same asset objects by
  reference; only the per-scene `assets` *map* is independently editable.
  `deleteAsset`/`canDeleteAsset` scan ALL scenes (objects' `assetId` + each
  scene's `mapAssetId`) and refuse to delete while referenced. `duplicateScene`
  now shares asset values (shallow-copied map) instead of deep-cloning them.
  Save schema bumped `PROJECT_SCHEMA_VERSION` 1 → 2; `loadProject` transparently
  migrates legacy v1 files by unioning all scenes' assets into every scene.
- **Reason:** Original per-scene asset storage hid an import made in scene B
  from scene A (flagged debt). Full hoist to `Project.assets` would have
  required rewriting the render pipeline, which is out of this tab's territory
  and high-risk; the mirror achieves the same user-visible result with no
  render changes. Known forward item: dropping an asset places a `marker`
  referencing the `assetId`; rendering the image itself on that marker is a
  separate render-pipeline task (ObjectNode/draw.ts are intentionally
  untouched here).
