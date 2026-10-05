# Structure

This replaces an earlier "Mock Structure / Placeholder layout until the real
design lands" tree that listed three files and did not match the repository.

## Layout

```
src/
  scene/        Scene model, store, types, selectors, undo, scene factory
    store.ts        the central Zustand store (see ROADMAP debt note)
    types.ts        SceneObject, Keyframe, Camera, transform helpers
    factory.ts      object construction + default props
    branding.ts     title-card typography and credits
    sceneSystem.ts  multi-scene project model + schema migration
  canvas/       Konva stage, overlays, gizmo math, interaction
  objects/      Pure object logic — groups, depth, path geometry, effects
  timeline/     Track model, keyframe editor, playback engine, camera track
  camera/       Camera presets, parallax, interaction, math
  render/       The single frame painter, Remotion compositions, interpolation
  ai/           Provider abstraction, tool validation, approval executor
  audio/        Freesound search and the audio engine (currently unmounted)
  motion/       Human-feel motion presets
  persistence/  Autosave
  ui/           Panels, inspector, dialogs, keyboard shortcuts
scripts/        exportBridge.mjs — server-side render with SSE progress
docs/           PRD, architecture, rendering, decisions, roadmap
```

## The load-bearing idea

`src/render/draw.ts` contains `drawScene`, the one function that paints a frame.
It is consumed by two callers:

- `src/render/PreviewPlayer.tsx` — the live editor preview, via Remotion `<Player>`
- `src/render/BattleScene.tsx` — headless `remotion render` via the CLI

`drawScene` is read-only with respect to scene state. That constraint is why
determinism is structural rather than aspirational, and why byte-stability
across separate headless renders is provable (see `docs/decisions.md`).

Any change that makes `drawScene` mutate the scene breaks this guarantee. Do
not.

## Module discipline

The logic layer is deliberately free of React and of the store, which is why so
much of it can be tested in a plain Node environment with no DOM:

- `src/objects/*.ts` — pure transforms, groups, geometry
- `src/motion/presets.ts` — pure preset definitions
- `src/ai/tools.ts` — validation only; no store, no React, no network
- `src/camera/cameraMath.ts` — pure math

Components under `src/ui/` and `src/canvas/` may use React and the store. The
boundary is one-directional.

## Testing

Tests sit beside the code they cover as `<module>.test.ts(x)`, with shared
render tests under `src/render/__tests__/` and UI setup in `src/test/setup.ts`.

`npm test` runs the full suite; `npm run check` runs typecheck, lint, tests and
build in that order.