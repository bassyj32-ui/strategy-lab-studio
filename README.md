# Strategy Lab Studio

A battlefield animation editor that runs in the browser.

Import a map, place and animate units, arrows and shapes, drive a camera track
and timeline, then render 1080p footage to finish in CapCut or DaVinci Resolve.

It is not a text-to-video tool. Nothing is generated from a prompt. You place
every element; the optional AI Commander proposes structured scene edits that
you approve before anything changes.

## Design

One function paints every frame. `drawScene` in `src/render/draw.ts` is called
by the live editor preview through Remotion's `<Player>`, and by the headless
`remotion render` CLI. It does not mutate scene state.

That constraint is the reason output is reproducible. There is no separate
"export path" that can drift from what you saw while editing, and byte-stability
across independent headless renders is provable rather than assumed.

## Features

- **Canvas** — Konva stage with marquee select, transform gizmos, group transforms, per-object editing
- **Timeline** — keyframes on any property, dedicated camera track, bulk keyframe operations, cubic bezier easing with five modes, section preview
- **Export** — MP4, ProRes 4444 with alpha, VP9 WebM with alpha, or PNG sequence, at 1920×1080
- **AI Commander** — 17 validated tools (`create_unit`, `move_group`, `set_keyframe`, …) over an OpenAI-compatible endpoint, DeepSeek by default
- **Scene** — multi-project support with schema migration, layer panel, motion presets, camera paths, parallax, background removal

## Stack

React 18 · TypeScript (strict) · Vite · Konva · Remotion · Zustand + Immer · Vitest

## Running it

```bash
npm install
npm run dev
```

| Script | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production bundle |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (764 tests) |
| `npm run check` | typecheck, lint, tests, build |
| `npm run render` | headless Remotion render |

CI runs `npm run check` on every push and pull request, plus a check that fails
if a credential-shaped literal is committed.

## API keys

None are needed to run the editor, and none are in this repository. The two
optional integrations take a key you supply at runtime; it is held in that
browser's `localStorage` and sent only to the provider.

- **AI Commander** — a DeepSeek (or other OpenAI-compatible) key, entered in the panel
- **Battle SFX** — a free Freesound token from freesound.org/apiv2

## Architecture

The constraints that shape most of the code, expanded in
[`docs/architecture.md`](docs/architecture.md):

1. The scene model is the single source of truth — editor, AI, save/load and render all read it
2. Assets, animation and rendering stay separate; objects are never baked into a map or into video
3. Every object has a unique ID and stays independently editable
4. Editing is non-destructive — asset + transform + animation, never modified source files
5. Rendering runs outside the request lifecycle

The AI layer is worth a specific note. `src/ai/tools.ts` validates model output
against a schema, bounds-checks it, and resolves it through a closed `switch`.
An unrecognised tool name is rejected, not executed. There is no `eval` and no
dynamic dispatch. The model proposes, a human approves, and only then does the
store change — as a single undoable transaction.

## Status

The MVP-1 loop works end to end: project system, map and asset import, canvas,
objects, layers, transforms, keyframes, timeline, playback, camera, live preview,
and deterministic export. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full
inventory.

Gaps worth knowing:

- Export is fixed at 1920×1080. 4K was specified in PRD §72 and is not built.
- No automated test asserts that a render produces a valid MP4. Remotion needs headless Chrome and FFmpeg, so the render tests stub the canvas context and check call sequences rather than pixels. Output has been verified manually instead.
- The audio subsystem (`src/audio/`, `src/ui/AudioPanel.tsx`) is complete but unmounted, because blob audio broke export.
- `src/scene/store.ts` is 2441 lines with roughly 118 members. Stable and well tested, but it is the main obstacle for anyone contributing.
- The AI provider layer has one implementation. The abstraction is designed for more and does not have them yet.

## Licence

No licence file is present, so default copyright applies. The code is publicly
readable, but nobody may copy, fork or redistribute it until a licence is added.

## Documentation

| File | |
|---|---|
| [`docs/prd.md`](docs/prd.md) | Frozen product requirements |
| [`docs/architecture.md`](docs/architecture.md) | Module layout and rationale |
| [`docs/rendering.md`](docs/rendering.md) | The four export modes |
| [`docs/decisions.md`](docs/decisions.md) | Dated decisions, including superseded ones |
| [`docs/STRUCTURE.md`](docs/STRUCTURE.md) | Directory layout and module discipline |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What is done, what is not |
| [`AGENTS.md`](AGENTS.md) | Engineering constraints and conventions |