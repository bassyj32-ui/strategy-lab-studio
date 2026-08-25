# Strategy Lab Internal Studio — Agent Rules

> Read this file before doing any work on this project. It encodes the frozen
> PRD v1.0 (sections 1–117). Violating these laws is worse than a bug.

## Product Identity (read first)
- This is a **deterministic, commander-controlled battlefield animation editor**.
- It is **NOT an AI video generator**. Never blur this line.
- The creator is the absolute commander at every stage. AI is an optional
  assistive layer only — it accelerates commands, it never decides.

## Stack
- React + TypeScript (strict mode)
- **Canvas scene-graph: react-konva** (recommended for MVP) — *decision pending
  final confirmation; PixiJS is the alternative*
- **Remotion + FFmpeg** is the only rendering path [PRD §66]
- **Zustand + Immer** for transactional state (undoable AI ops) [PRD §84]
- **Supabase** = optional cloud only (auth / scene backup / sync). The core
  editor must run fully without it [PRD §76]

## Architecture Laws
1. **Scene model is the single source of truth** — editor preview, AI
   Commander, save/load, and Remotion rendering all read the same data
   [PRD §65, §99]. Never maintain a second incompatible representation.
2. **Separate forever:** ASSETS vs ANIMATION (transforms/keyframes) vs
   RENDERING. Never bake tactical objects into maps or into video [PRD §98].
3. **Every battlefield object has a unique ID** and stays independently
   editable after placement and animation [PRD §8].
4. **Non-destructive editing:** store Asset + Transform + Animation; never
   modify source asset files [PRD §43].
5. **World coordinates per map**; the camera lives in world space [PRD §87].
6. **Rendering runs OUTSIDE the web request lifecycle** — never block on
   1080p/4K renders inside request handlers [PRD §68].

## AI Rules
- AI acts ONLY through approved tool calls on structured scene data
  (e.g. `create_unit`, `move_group`, `set_keyframe`) [PRD §53–54].
- Wrap each complex AI operation in **ONE undoable transaction** [PRD §60].
- Feed AI a **summarized scene state**, never hundreds of raw objects
  [PRD §62].
- AI **NEVER** renders video, never overwrites keyframes without approval,
  never decides historical truth [PRD §105].
- AI provider must be **abstracted/swappable** (DeepSeek initial) [PRD §64].

## Scope Discipline
- Requirements are **FROZEN** (PRD v1.0). Build **P0 / MVP-1** only until the
  core loop is proven [PRD §100, §112]. Do not pull P1–P3 features forward
  unless explicitly asked.
- **No SaaS anything:** no billing, no public signup, no teams, no
  marketplace, no multi-tenant architecture [PRD §3].
- **INTERNAL-ONLY, FOREVER:** this is a private single-user tool for the
  owner (bassyj32-ui). It must NEVER be published, shared publicly, or
  deployed as a public site under any circumstance. No feature work exists
  to serve hypothetical other users.
- CapCut/DaVinci own final filmmaking — we stop at exported footage [PRD §92].

## Coding
- TypeScript strict; no unnecessary dependencies.
- Reuse existing components/assets; do not rewrite working code.
- Performance budget: smooth editing on **MacBook Air M1** — use proxies,
  low-res previews, GPU-friendly canvas [PRD §97].
- Do not render battlefield objects as ordinary React DOM elements [PRD §83].

## Workflow
1. Inspect → 2. Plan → 3. Implement → 4. Test → 5. Review → 6. Report

## Never
- Expose secrets or commit `.env` files.
- Change database schema without approval.
- Make irreversible scene changes without undo history.
- Delete files without explaining why.
- Render video via any path other than Remotion → FFmpeg.

## Definitions of Done (MVP-1)
P0 must work before anything else [PRD §112]:
project system, map import, asset import, canvas, object system, layers,
drag/drop, position/rotation/scale/opacity, keyframes, timeline, playback,
camera, Remotion preview, deterministic MP4 export.
