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

## 3. Export expectations (MVP-1)

- Deterministic MP4 export at the chosen resolution/fps.
- Live Remotion preview inside the editor for scrubbing/playback.
- Output is raw footage for finishing in CapCut/DaVinci — we stop there (PRD §92).

## 4. What rendering must NEVER do

- Never bake tactical objects into the source map image.
- Never mutate the scene model to produce a frame.
- Never let the AI layer trigger or influence a render (AI is P3, and even
  then it never renders — PRD §105).

## 5. Open items for MVP-2+

- Transparent overlay export (alpha) for layering in external tools.
- Individual scene export.
- Proxy rendering + render queue (MVP-3) for long/4K jobs.
