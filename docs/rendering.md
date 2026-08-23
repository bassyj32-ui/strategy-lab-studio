# Rendering — Strategy Lab Internal Studio

> The rendering layer is deterministic by definition. This document records the
> only sanctioned render path and the rules that keep output reproducible.

## 1. The only render path

**Remotion + FFmpeg.** No other renderer is permitted (PRD §66).

- The scene model (see `architecture.md` §3) is the input.
- Remotion drives frames from the scene's `timeline` + `keyframes` + `camera`.
- FFmpeg encodes the frames to a deterministic MP4.

## 2. Determinism rules

1. **Single source of truth.** Remotion reads the *same* scene model the
   editor uses. No hand-built frame data.
2. **No randomness in render.** Every value (position, rotation, opacity,
   camera) comes from keyframes or fixed inputs. Seeded only if a generator is
   ever introduced (not in MVP-1).
3. **Fixed timeline.** `timeline.duration` and `timeline.fps` are explicit.
   The same scene + same timeline = byte-stable output across runs.
4. **Outside the request lifecycle.** Rendering is a job, not an inline web
   response (PRD §68). The editor never blocks on a 1080p/4K render.

## 3. Export modes (owner-approved P1 pull-forward)

Two Compositions are registered over the SAME `BattleScene` component in
`Root.tsx`, so both modes read the identical scene model and paint through the
same deterministic `drawScene()`:

| Composition id     | Mode       | Output                                                            |
| ------------------ | ---------- | ----------------------------------------------------------------- |
| `BattleScene`      | `standard` | Opaque background (`#0b0e14`) + map + objects → deterministic MP4  |
| `BattleSceneAlpha` | `alpha`    | Objects ONLY — transparent background, no map, no banner → overlay |

### 3a. `standard` (default, MVP-1)

- Opaque background fill + map image + objects.
- Deterministic MP4 at the chosen resolution/fps. Byte-determinism law
  applies: the same scene + timeline must re-render to an identical SHA-256.
- Command: `npm run render` (uses default props; no `--props` needed).

### 3b. `alpha` (transparent overlay)

- **Objects only**: the background fill AND the map image are skipped, so the
  output is a transparent overlay for layering over external footage in
  CapCut/DaVinci (PRD §92 — we stop at exported footage). The map-failure
  banner is suppressed in this mode because the map is intentionally not part
  of an overlay's output.
- Invoked via the `BattleSceneAlpha` composition, which FORCES alpha mode
  internally regardless of `--props` (a props file replaces props wholesale,
  so relying on a prop alone would silently fall back to standard mode).
- **Exempt from cross-codec determinism** (different encoders compress alpha
  differently), but each codec choice must be internally reproducible: same
  scene + same flags = stable output across runs. Frames themselves come from
  the same deterministic `drawScene()`, so all variance lives in FFmpeg.

Commands (all alpha paths need PNG intermediate frames — JPEG cannot carry
alpha):

```bash
# ProRes 4444 .mov — best quality / NLE compatibility (DaVinci, FCP, CapCut):
npx remotion render src/render/index.ts BattleSceneAlpha out/overlay.mov \
  --codec=prores --prores-profile=4444 \
  --image-format=png --pixel-format=yuva444p10le

# VP9 WebM — compact, browser-friendly (half-width chroma on alpha edges):
npx remotion render src/render/index.ts BattleSceneAlpha out/overlay.webm \
  --image-format=png --pixel-format=yuva420p --codec=vp9

# PNG sequence — lossless fallback of record (huge on disk):
npx remotion render src/render/index.ts BattleSceneAlpha out/overlay-seq \
  --sequence
```

| Path | Pros | Cons |
| --- | --- | --- |
| ProRes 4444 `.mov` (`yuva444p10le`) | Best editing-software compatibility; full-bandwidth alpha | Very large files |
| VP9 `.webm` (`yuva420p`) | Compact, browser-friendly | Half-width chroma on alpha edges; weaker NLE support |
| PNG sequence | Lossless frames, zero codec variance | Huge storage; must be re-encoded by the NLE |

### 3c. Shadows in the render

Objects whose asset metadata sets `defaultShadow: true` (§44) draw a fixed soft
offset shadow via canvas 2D (`shadowColor/shadowBlur/shadowOffsetX/Y`). The
parameters are compile-time constants scaled only by camera zoom — no
randomness, no time-of-day — so shadows are byte-deterministic like everything
else. The editing canvas now previews these same shadows (the editor's
`ObjectNode` applies the identical constants scaled by camera zoom × display
scale), so what the commander sees matches the export (Tab D gap closed).

### 3d. Export expectations (MVP-1)

- Deterministic MP4 export at the chosen resolution/fps (`standard` mode).
- Live Remotion preview inside the editor for scrubbing/playback.
- Output is raw footage for finishing in CapCut/DaVinci — we stop there (PRD §92).

## 4. What rendering must NEVER do

- Never bake tactical objects into the source map image.
- Never mutate the scene model to produce a frame.
- Never let the AI layer trigger or influence a render (AI is P3, and even
  then it never renders — PRD §105).

## 5. Open items for MVP-2+

- Proxy rendering + render queue (MVP-3) for long/4K jobs.

## 6. Multi-scene export (manual, per scene)

Projects may contain several scenes (Scenes panel). Rendering is still
per-scene and manual — there is no CLI batch exporter yet:

1. Make the target scene active (click it in the Scenes panel).
2. Click **Export Video (copy command)** in the toolbar. This saves the active
   scene as `scene.json` (plain `Scene` JSON) AND copies the exact render
   command below to your clipboard — so you never hand-write it.
   (Plain **Save Scene JSON** also just downloads `scene.json` if you prefer.)
3. Paste and run that single-scene command in your terminal:

   ```bash
   npx remotion render src/render/index.ts BattleScene out/scene.mp4 \
     --props=scene.json
   ```

4. Repeat per scene and stitch/order the clips in CapCut/DaVinci.

Note: **Save Project** (Scenes panel) writes a different, versioned envelope
(`{ schemaVersion, activeSceneId, scenes: [...] }`) — that file is for
backup/transfer of whole projects and is NOT directly usable as Remotion
props.
