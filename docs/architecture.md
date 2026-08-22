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
    types.ts
    store.ts        # Zustand+Immer, undoable transactions
  assets/           # import + registry (immutable source assets)
  canvas/           # react-konva stage, layers, object rendering
  objects/          # object system: create/move/transform/scale/opacity
  timeline/         # keyframes, playback, scrubbing
  camera/           # camera controls in world space
  render/           # Remotion composition + FFmpeg export entry
  ui/               # panels, inspector, toolbar (NOT the battlefield itself)
```

**Rule:** battlefield objects are canvas (konva) nodes, never ordinary React DOM
elements. UI panels are React DOM; the battlefield is not.

## 7. Rendering boundary

Rendering runs **outside the web request lifecycle**. The editor triggers a
render job; the job (Remotion + FFmpeg) produces deterministic MP4 footage.
Never block the editor thread on 1080p/4K render.

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
