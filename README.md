# Strategy Lab Studio

A deterministic, commander-controlled **battlefield animation editor** for the web.

Import a clean map, place and animate every tactical element, drive the camera
and timeline, then render deterministic 1080p footage you finish in CapCut or
DaVinci Resolve.

> This is **not** an AI video generator. There is no prompt-to-video here. You
> place every unit; the AI Commander only proposes structured scene edits that
> you approve before anything changes.

---

## Why this exists

Most battle-animation tooling makes you choose between control and speed. You
either hand-place every element over hours, or you accept whatever an opaque
model produced. This studio is built for the opposite trade: **deterministic,
inspectable, repeatable** output, where the creator stays in command.

The core bet is that **one frame painter serves two consumers**. The same
`drawScene` function paints the live editor preview and the headless
Remotion/FFmpeg render. What you see is what renders — there is no second
representation to drift out of sync.

## What it does

- **Scene-graph canvas** — Konva/stage-based, with marquee select, transform
  gizmos, group transforms, and per-object independent editing
- **Timeline** — keyframes on any property, a dedicated camera track, bulk
  keyframe operations, cubic bezier easing with five easing modes, and section
  preview
- **Deterministic video export** — MP4, ProRes 4444 (alpha), VP9 WebM (alpha),
  or PNG sequence, at a hard 1920×1080
- **AI Commander** — 17 validated tools (`create_unit`, `move_group`,
  `set_keyframe`, …) over an OpenAI-compatible endpoint (DeepSeek by default)
- **Motion presets, camera paths, parallax, battle SFX** — layered background
  removal and cached image previews for smooth scrubbing

## Stack

React 18 · TypeScript (strict) · Vite · Konva · Remotion · Zustand + Immer · Vitest

## Getting started

```bash
npm install
npm run dev        # local editor
npm run check      # typecheck + lint + tests + build
```

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | production bundle |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite (764 tests) |
| `npm run check` | all of the above, in order |
| `npm run render` | headless Remotion render |

### API keys

There are **no credentials in this repository, and none are required to run the
editor.** If you enable the optional integrations, you supply your own key at
runtime and it is stored in that browser's `localStorage` only — it is never
committed, never logged, and never sent anywhere except the provider:

- **AI Commander** — your DeepSeek (or other OpenAI-compatible) key, entered
  in the AI Commander panel
- **Battle SFX** — a free Freesound token from freesound.org/apiv2

## Architecture

Five laws that explain most of the code:

1. **The scene model is the single source of truth.** Editor, AI Commander,
   save/load, and the Remotion render all read the same data.
2. **Assets, animation, and rendering stay separate.** Tactical objects are
   never baked into a map or into video.
3. **Every object has a unique ID** and stays independently editable after
   placement and animation.
4. **Editing is non-destructive.** We store asset + transform + animation and
   never modify source files.
5. **Rendering runs outside the request lifecycle.** Long renders are never
   blocking.

The AI layer deserves specific mention: `src/ai/tools.ts` is a pure validation
module. Model output is parsed against a schema, bounds-checked, and resolved
through a **closed switch** — an unrecognised tool name is rejected, never
executed. The model proposes; a human approves; the store applies. There is no
`eval`, no dynamic dispatch, and no path from model output to scene state
without a click.

See [`docs/architecture.md`](docs/architecture.md), [`docs/rendering.md`](docs/rendering.md),
and [`docs/decisions.md`](docs/decisions.md) for the full rationale, including
dated decisions and superseded entries.

## Current status

Working: the full MVP-1 loop — project system, map import, asset import,
canvas, object system, layers, transforms, keyframes, timeline, playback,
camera, live preview, and deterministic export.

Known gaps, honestly:

- Export resolution is fixed at 1080p. 4K was intended and is not built.
- There is **no automated test that a render produces a valid MP4.** Remotion
  needs headless Chrome and FFmpeg, which the unit suite stubs out, so the
  render tests assert call sequences rather than pixels.
- The battle SFX panel and audio subsystem are present but not currently
  mounted in the UI.
- `src/scene/store.ts` is large and is the main obstacle for new contributors.
- The AI provider abstraction has one real implementation; it is designed for
  more and does not have them yet.

## Licence status

**No licence file is present yet, so default copyright applies.** You may read
this code, but nobody — including you — may legally copy, fork, modify or
redistribute it until a licence is added. This is deliberate for now and will
change.

## Documentation

| File | What's in it |
|---|---|
| [`docs/prd.md`](docs/prd.md) | The frozen product requirements — the source of truth for what this is meant to be |
| [`docs/architecture.md`](docs/architecture.md) | Module layout and the design rationale |
| [`docs/rendering.md`](docs/rendering.md) | The four export modes and how the frame painter stays single-source |
| [`docs/decisions.md`](docs/decisions.md) | Dated decisions, including superseded ones and why |
| [`AGENTS.md`](AGENTS.md) | The engineering laws this codebase is held to |