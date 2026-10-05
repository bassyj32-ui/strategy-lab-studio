# Roadmap

Status legend: **done** · **in progress** · **not started**

This replaces an earlier version of this file that was a four-checkbox mock
("Decide stack / Project scaffold / Core features / Deploy") and had drifted
completely out of date — every box was either finished or superseded.

## Done

The MVP-1 core loop, per `AGENTS.md`:

- Project system with multi-scene support and schema migration
- Map import with cached previews
- Asset import and registry
- Konva canvas stage with camera (position, zoom, rotation, pan)
- Object system with unique IDs and independent editing
- Layer panel with reorder and visibility
- Marquee selection and group transforms
- Transform gizmos with drag handling
- Position / rotation / scale / opacity, all keyframable
- Timeline with keyframe track, ruler, selection sync
- Camera track with path overlay
- Cubic bezier easing and five easing modes
- Bulk keyframe operations and keyframe jump
- Playback engine with a single shared clock
- Remotion live preview
- Deterministic export: MP4, ProRes 4444 alpha, VP9 WebM alpha, PNG sequence
- Undo/redo hardening (gesture collapsing, no-op suppression, dirty-set isolation)
- Autosave
- AI Commander with 17 validated tools and human-gated approval
- Motion presets, parallax, background removal
- Section preview in the timeline

## Not started

- **4K / 1440p export.** `EXPORT_RESOLUTION` is hardcoded to 1920×1080 in
  `src/render/defaultProps.ts`. PRD §72 asked for 4K.
- **Render integration test.** No automated test proves a render produces a
  valid MP4. Remotion needs headless Chrome and FFmpeg; the current tests stub
  the context and assert call sequences, not pixels.
- **Multi-scene export.** `docs/rendering.md` documents manual copy-paste. The
  in-app ExportDialog supersedes this for the active scene only.
- **Additional AI providers.** The abstraction exists and is designed for
  multiple providers, but DeepSeek is the only implementation. The factory
  currently ignores its kind argument.
- **Audio subsystem re-enable.** `src/audio/` and `src/ui/AudioPanel.tsx` are
  complete but unmounted, because blob audio broke export. Needs a decision.
- **`scenesEqual` key-order fragility.** Uses `JSON.stringify`; flagged in
  `docs/decisions.md` and not fixed.

## Known architectural debt

- **`src/scene/store.ts` is 2441 lines** with ~118 interface members. One store
  owns objects, keyframes, layers, scenes, groups, camera, assets, audio,
  branding, undo, AI application and autosave coordination. This is the main
  barrier for new contributors and the highest-value refactor available.
- **`src/canvas/CanvasStage.tsx` is 1576 lines** and imports ~100 symbols across
  25 modules, mixing stage rendering, camera interaction, gizmo math, marquee,
  path handles, group overlay, audio and keyboard handling.
- **Camera rotation units.** Canonical unit is radians
  (`src/scene/types.ts:300-310`); `src/render/camera.ts` still assumes degrees.
  Documented at every layer, dormant, not silently broken.

## Housekeeping

- No LICENSE file yet. Default copyright applies until one is added.
- No deployment config. The app builds but is not hosted anywhere.