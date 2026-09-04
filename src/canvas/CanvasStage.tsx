import { useRef, useState, useMemo, useEffect } from 'react';
import type { DragEvent as ReactDragEvent, ReactNode } from 'react';
import {
  Stage,
  Layer,
  Rect,
  Line,
  Group,
  Circle,
  Text as KonvaText,
  Image as KonvaImage,
} from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
// The camera lives in world space (PRD §87): its state is owned by the scene
// store; this canvas binds it through useCamera and wires interactive
// wheel-zoom + background drag-pan below.
import {
  useSceneStore,
} from '../scene/store';
import {
  visibleLayersOrdered,
  objectsForLayer,
  selectedObject,
} from '../scene/selectors';
import { getCameraAtTime, hasCameraTrack } from '../timeline/cameraTrack';
import { usePlaybackStore } from '../timeline/playbackStore';
import {
  ObjectNode,
  SHAPE_SIZE,
  MARKER_RADIUS,
  ARROW_SHAFT_WIDTH,
  ARROWHEAD_HALF_WIDTH,
  ARROWHEAD_LENGTH,
} from '../objects/ObjectNode';
import { DEFAULT_ARROW_LENGTH, DEFAULT_ARROW_COLOR } from '../objects/factory';
import { useSoloEditStore } from '../objects/soloEdit';
import { arrowFromDrag } from '../objects/drawGesture';
import {
  resolveWorldTransform,
  composeTransform,
  worldPointToLocal,
  groupRootOf,
  snakeConfigForGroup,
} from '../objects/groups';
import { getObjectWorldTransformAtTime } from '../timeline/selectors';
import type {
  Asset,
  Keyframe,
  SceneObject,
  SceneObjectType,
  Transform,
} from '../scene/types';
import {
  segmentControlPoints,
  cubicBezierPoint,
  segmentIsCurved,
} from '../render/interpolate';
import {
  useCamera,
  screenToWorld,
  wheelDeltaToFactor,
  normalizeWheelDelta,
  clientToStagePoint,
  resetCamera,
  ZOOM_STEP,
  useCameraPan,
} from '../camera';
import { AudioEngine } from '../audio/audioEngine';
import { layerCamera, parallaxLayerTransform } from '../camera/parallax';
import { CameraHud } from './CameraHud';
import { useMapImage } from './useMapImage';
import { CameraPathOverlay } from './CameraPathOverlay';
import { WaypointHandles } from './WaypointHandles';
import { GroupOverlay } from './GroupOverlay';
import { EffectOverlay } from './EffectOverlay';
import { ShapeGuideOverlay } from './ShapeGuideOverlay';
import { MarqueeOverlay } from './MarqueeOverlay';
import { worldRectFromPoints, objectsInWorldRect } from './marquee';
import type { WorldRect } from './marquee';
import { isSpaceDown, bindSpaceHold } from '../ui/spaceKey';
import { ASSET_DND_MIME } from '../ui/AssetsPanel';
import { SelectionHud } from '../ui/SelectionHud';
import {
  type Box,
  type Pt,
  clampScale,
  continuousDeg,
  cornerWorld,
  dist,
  edgeWorld,
  nudgeStep,
  normalizeDeg,
  rotationFromPointer,
  scaleFromDrag,
  snapDeg,
  stalkWorld,
  topCenterWorld,
} from './gizmo';
import { simplifyPath } from '../objects/simplifyPath';

// The MVP-1 editor preview is a low-res proxy: show the 1920x1080 world at
// half scale so it fits typical screens (performance budget: MacBook Air M1).
const DISPLAY_SCALE = 0.5;
const GRID_STEP = 120;

function SelectionOutline({
  obj,
  world,
  asset,
}: {
  obj: SceneObject;
  world: Transform;
  /** Resolved library asset (for asset-backed objects); sizes the box. */
  asset?: Asset;
}) {
  const { x, y, rotation, scale } = world;
  // Arrows are TAIL-anchored (tip at local (length, 0)); every other kind is
  // center-anchored. The outline must match each convention.
  if (obj.type === 'arrow') {
    const len = obj.length ?? DEFAULT_ARROW_LENGTH;
    const padY = ARROWHEAD_HALF_WIDTH + 4;
    return (
      <Group x={x} y={y} rotation={rotation} scaleX={scale} scaleY={scale}>
        <Rect
          x={-ARROW_SHAFT_WIDTH}
          y={-padY}
          width={len + ARROWHEAD_LENGTH + ARROW_SHAFT_WIDTH}
          height={padY * 2}
          stroke="#4d8dff"
          strokeWidth={2}
          strokeScaleEnabled={false}
          fillEnabled={false}
          listening={false}
        />
      </Group>
    );
  }
  // Size the selection box to the resolved asset (image) when present so the
  // outline matches what is actually painted on the canvas; fall back to the
  // vector placeholder size otherwise (keeps the gray "U" box correct).
  const box = selectionLocalBox(obj, asset);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  return (
    <Group x={x} y={y} rotation={rotation} scaleX={scale} scaleY={scale}>
      <Rect
        x={box.minX}
        y={box.minY}
        width={w}
        height={h}
        stroke="#4d8dff"
        strokeWidth={2}
        strokeScaleEnabled={false}
        fillEnabled={false}
        listening={false}
      />
    </Group>
  );
}

/** Bezier guide polyline samples per segment (smooth enough, cheap). */
const CURVE_SAMPLES = 24;
const CURVE_COLOR = '#38bdf8';
const HANDLE_RADIUS_SCREEN = 7;

/** Local-unit bounding box of an object around its anchor, for gizmos. */
function selectionLocalBox(obj: SceneObject, asset?: Asset): Box {
  if (obj.type === 'arrow') {
    const len = obj.length ?? DEFAULT_ARROW_LENGTH;
    const padY = ARROWHEAD_HALF_WIDTH + 4;
    return {
      minX: -ARROW_SHAFT_WIDTH,
      minY: -padY,
      maxX: len + ARROWHEAD_LENGTH,
      maxY: padY,
    };
  }
  if (obj.type === 'marker') {
    return {
      minX: -MARKER_RADIUS,
      minY: -MARKER_RADIUS,
      maxX: MARKER_RADIUS,
      maxY: MARKER_RADIUS,
    };
  }
  // Asset-backed objects (sprites/images) are painted at the asset's intrinsic
  // size (centered on the anchor), so the selection box must match it. Without
  // an asset (the reserved gray "U" placeholder) the vector size applies.
  if (asset) {
    const hw = asset.width / 2;
    const hh = asset.height / 2;
    return { minX: -hw, minY: -hh, maxX: hw, maxY: hh };
  }
  const half = SHAPE_SIZE / 2;
  return { minX: -half, minY: -half, maxX: half, maxY: half };
}

const GIZMO_COLOR = '#4d8dff';
const STALK_LEN_SCREEN = 26;

/**
 * On-canvas transform gizmos (Figma-style) for the SELECTED object: 8 scale
 * handles (4 corners + 4 edge-midpoints, drag = multiplicative uniform scale
 * around the anchor) + a rotation stalk above the box (drag = rotate; Shift
 * snaps to 15°). MOVE is body-drag on the object itself — there is deliberately
 * NO center move dot (it competed with the body target and made grabs miss).
 * All math is pure (canvas/gizmo.ts); writes go through the EXISTING
 * updateTransform action inside ONE begin/endInteraction session per gesture,
 * coalesced with rAF so per-mousemove store writes don't jank. Grouped
 * children work: pointer positions are mapped into the parent frame.
 */
function SelectionGizmos({
  obj,
  worldT,
  parentFrame,
  pointerWorld,
  asset,
}: {
  obj: SceneObject;
  worldT: Transform;
  parentFrame: Transform | null;
  /** Stage pointer → WORLD coords under the displayed camera. */
  pointerWorld: () => Pt | null;
  /** Resolved library asset (for asset-backed objects); sizes the gizmo box. */
  asset?: Asset;
}) {
  const beginInteraction = useSceneStore((s) => s.beginInteraction);
  const endInteraction = useSceneStore((s) => s.endInteraction);
  const updateTransform = useSceneStore((s) => s.updateTransform);

  const frame = parentFrame ?? {
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    opacity: 1,
  };
  // Anchor + pointer in PARENT-frame coords (local semantics for children).
  const anchorLocal: Pt = worldPointToLocal(frame, worldT.x, worldT.y);
  const pointerInFrame = (): Pt | null => {
    const w = pointerWorld();
    if (!w) return null;
    return worldPointToLocal(frame, w.x, w.y);
  };

  const zoom = useSceneStore((s) => s.scene.camera.zoom);
  const k = 1 / Math.max(zoom, 0.0001); // screen px → world units
  const box = selectionLocalBox(obj, asset);
  const rotDeg = worldT.rotation;

  const scaleDragRef = useRef<{ startDist: number; startScale: number } | null>(
    null
  );
  const rafRef = useRef<number | null>(null);
  const pendingScaleRef = useRef<number | null>(null);
  const prevDegRef = useRef<number>(worldT.rotation);
  const [liveDeg, setLiveDeg] = useState<number | null>(null);
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const cursor = (c: string) => ({
    onMouseEnter: (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (stage) stage.container().style.cursor = c;
    },
    onMouseLeave: (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (stage) stage.container().style.cursor = 'default';
    },
  });

  const corners: Array<{
    key: string;
    cx: 'min' | 'max';
    cy: 'min' | 'max';
    cur: 'nwse-resize' | 'nesw-resize';
  }> = [
    { key: 'nw', cx: 'min', cy: 'min', cur: 'nwse-resize' },
    { key: 'ne', cx: 'max', cy: 'min', cur: 'nesw-resize' },
    { key: 'se', cx: 'max', cy: 'max', cur: 'nwse-resize' },
    { key: 'sw', cx: 'min', cy: 'max', cur: 'nesw-resize' },
  ];

  const stalk = stalkWorld(anchorLocal, box, rotDeg, worldT.scale, STALK_LEN_SCREEN * k);
  // FIX: the stalk line starts at the box TOP-CENTER (not the NW corner).
  const stalkBase = topCenterWorld(anchorLocal, box, rotDeg, worldT.scale);

  const edges: Array<{ key: string; edge: 'n' | 's' | 'e' | 'w'; cur: string }> = [
    { key: 'n', edge: 'n', cur: 'ns-resize' },
    { key: 's', edge: 's', cur: 'ns-resize' },
    { key: 'e', edge: 'e', cur: 'ew-resize' },
    { key: 'w', edge: 'w', cur: 'ew-resize' },
  ];

  const beginScale = (): void => {
    const lp = pointerInFrame();
    scaleDragRef.current = {
      startDist: lp ? Math.max(dist(lp, anchorLocal), 1) : 1,
      startScale: obj.transform.scale,
    };
    beginInteraction();
  };
  const moveScale = (): void => {
    // rAF-coalesced: compute now, commit on the next frame — per-mousemove
    // Zustand+Immer writes were the jank source.
    const base = scaleDragRef.current;
    const lp = pointerInFrame();
    if (!base || !lp) return;
    pendingScaleRef.current = clampScale(
      scaleFromDrag(base.startScale, base.startDist, Math.max(dist(lp, anchorLocal), 1))
    );
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const s = pendingScaleRef.current;
      pendingScaleRef.current = null;
      if (s !== null) updateTransform(obj.id, { scale: s });
    });
  };
  const endScale = (): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Flush the last pending value synchronously so the gesture lands exact.
    const s = pendingScaleRef.current;
    pendingScaleRef.current = null;
    scaleDragRef.current = null;
    if (s !== null) updateTransform(obj.id, { scale: s });
    endInteraction();
  };

  const scaleHandle = (
    key: string,
    p: Pt,
    cur: string,
    testId: string
  ): ReactNode => {
    // Screen-constant 12px handles (+ padding ease on tiny assets via the hit ring).
    const size = 12 * k;
    const hit = 20 * k;
    return (
      <Group key={key} x={p.x} y={p.y}>
        {/* Invisible fat hit ring — small assets stay grabbable. */}
        <Rect
          x={-hit / 2}
          y={-hit / 2}
          width={hit}
          height={hit}
          // Invisible but HITTABLE: opacity-0 fill stays in Konva's hit graph
          // (fillEnabled={false} would remove it — that was the dead-handles bug).
          fill="#000000"
          opacity={0}
          draggable
          {...cursor(cur)}
          onDragStart={beginScale}
          onDragMove={moveScale}
          onDragEnd={endScale}
        />
        <Rect
          data-testid={testId}
          x={-size / 2}
          y={-size / 2}
          width={size}
          height={size}
          fill="#ffffff"
          stroke={GIZMO_COLOR}
          strokeWidth={2 * k}
          cornerRadius={2 * k}
          listening={false}
        />
      </Group>
    );
  };

  return (
    <>
      {corners.map((c) => {
        const p = cornerWorld(anchorLocal, box, rotDeg, worldT.scale, c.cx, c.cy);
        return scaleHandle(`corner-${c.key}`, p, c.cur, `gizmo-corner-${c.key}`);
      })}
      {edges.map((e) => {
        const p = edgeWorld(anchorLocal, box, rotDeg, worldT.scale, e.edge);
        return scaleHandle(`edge-${e.key}`, p, e.cur, `gizmo-edge-${e.key}`);
      })}

      {/* Rotation stalk: line from TOP-CENTER up, knob at the tip. */}
      <Line
        points={[stalkBase.x, stalkBase.y, stalk.x, stalk.y]}
        stroke={GIZMO_COLOR}
        strokeWidth={1.5 * k}
        listening={false}
      />
      <Group x={stalk.x} y={stalk.y}>
        {/* Fat invisible hit ring around the knob (20px screen). */}
        <Circle
          data-testid="gizmo-stalk-hit"
          radius={12 * k}
          // Same invisible-but-hittable rule as the scale hit rings above.
          fill="#000000"
          opacity={0}
          draggable
          {...cursor('grab')}
          onDragStart={() => {
            prevDegRef.current = obj.transform.rotation;
            setLiveDeg(normalizeDeg(obj.transform.rotation));
            beginInteraction();
          }}
          onDragMove={(e) => {
            const lp = pointerInFrame();
            if (!lp) return;
            let deg = rotationFromPointer(anchorLocal, lp);
            if (e.evt.shiftKey) deg = snapDeg(deg, 15);
            else if (e.evt.altKey) deg = snapDeg(deg, 1); // Alt = fine 1°
            // Shortest-path across the ±180 seam — no more 360° jumps.
            deg = continuousDeg(prevDegRef.current, deg);
            prevDegRef.current = deg;
            setLiveDeg(deg);
            updateTransform(obj.id, { rotation: normalizeDeg(deg) });
          }}
          onDragEnd={() => {
            setLiveDeg(null);
            endInteraction();
          }}
        />
        <Circle
          data-testid="gizmo-stalk"
          radius={7 * k}
          fill="#ffffff"
          stroke={GIZMO_COLOR}
          strokeWidth={2 * k}
          listening={false}
        />
        {liveDeg !== null && (
          <Group y={-18 * k} listening={false}>
            <Rect
              x={-26 * k}
              y={-11 * k}
              width={52 * k}
              height={22 * k}
              fill="#0b1020"
              stroke={GIZMO_COLOR}
              strokeWidth={1 * k}
              cornerRadius={4 * k}
            />
            <KonvaText
              x={-26 * k}
              y={-11 * k}
              width={52 * k}
              height={22 * k}
              text={`${Math.round(liveDeg)}°`}
              fontSize={12 * k}
              fill="#ffffff"
              align="center"
              verticalAlign="middle"
            />
          </Group>
        )}
      </Group>
    </>
  );
}

interface HandleTarget {
  x: number;
  y: number;
  /** Owning keyframe time (identity for setKeyframeCp). */
  kfTime: number;
  which: 'cpIn' | 'cpOut';
}

/**
 * Curved-path editing overlay (owner-approved P1): for the SELECTED object
 * with ≥2 keyframes, draws a dashed bezier guide per segment and draggable
 * circles at each control point (P1 = start+cpOut, P2 = end+cpIn; missing
 * handles show at the collinear 1/3 / 2/3 defaults). Dragging writes cp
 * offsets via setKeyframeCp inside ONE begin/endInteraction gesture; a
 * double-click clears a handle back to its default. All positions are world
 * coords — the camera transform lives on the Stage.
 */
function PathHandles({
  obj,
  parentWorld,
}: {
  obj: SceneObject;
  parentWorld: Transform | null;
}) {
  const keyframesMap = useSceneStore((s) => s.scene.keyframes);
  const zoom = useSceneStore((s) => s.scene.camera.zoom);
  const beginInteraction = useSceneStore((s) => s.beginInteraction);
  const endInteraction = useSceneStore((s) => s.endInteraction);
  const setKeyframeCp = useSceneStore((s) => s.setKeyframeCp);

  const sorted = useMemo(
    () => [...(keyframesMap[obj.id] ?? [])].sort((a, b) => a.time - b.time),
    [keyframesMap, obj.id]
  );

  const r = HANDLE_RADIUS_SCREEN / Math.max(zoom, 0.0001);

  if (sorted.length < 2) return null;

  // Keyframes are stored in the object's LOCAL frame; the parent (if any)
  // folds in via `parentWorld`. Map every guide/handle point into world space
  // so curved paths render correctly for grouped children.
  const IDENTITY: Transform = {
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    opacity: 1,
  };
  const toWorld = (p: { x: number; y: number }) => {
    const w = composeTransform(parentWorld ?? IDENTITY, {
      x: p.x,
      y: p.y,
      rotation: 0,
      scale: 1,
      opacity: 1,
    });
    return { x: w.x, y: w.y };
  };

  const guides: ReactNode[] = [];
  const handles: HandleTarget[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const a: Keyframe = sorted[i];
    const b: Keyframe = sorted[i + 1];
    const { p0, p1, p2, p3 } = segmentControlPoints(a, b);
    const pts: number[] = [];
    for (let s = 0; s <= CURVE_SAMPLES; s++) {
      const pt = cubicBezierPoint(p0, p1, p2, p3, s / CURVE_SAMPLES);
      const w = toWorld(pt);
      pts.push(w.x, w.y);
    }
    // Only curve-shaped segments get the dashed guide; straight ones stay
    // visually clean (the chord is obvious).
    if (segmentIsCurved(a, b)) {
      guides.push(
        <Line
          key={`curve-${a.time}`}
          points={pts}
          stroke={CURVE_COLOR}
          strokeWidth={1.5 / Math.max(zoom, 0.0001)}
          dash={[8 / Math.max(zoom, 0.0001), 6 / Math.max(zoom, 0.0001)]}
          listening={false}
        />
      );
    }
    const w1 = toWorld(p1);
    const w2 = toWorld(p2);
    handles.push(
      { x: w1.x, y: w1.y, kfTime: a.time, which: 'cpOut' },
      { x: w2.x, y: w2.y, kfTime: b.time, which: 'cpIn' }
    );
  }

  return (
    <>
      {guides}
      {handles.map((h) => (
        <Circle
          key={`${obj.id}-${h.kfTime}-${h.which}`}
          x={h.x}
          y={h.y}
          radius={r}
          fill={CURVE_COLOR}
          stroke="#ffffff"
          strokeWidth={1.5 / Math.max(zoom, 0.0001)}
          opacity={0.9}
          draggable
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = 'move';
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = 'default';
          }}
          onDragStart={() => beginInteraction()}
          onDragMove={(e) => {
            const pos = e.target.position();
            const kf = sorted.find((k) => k.time === h.kfTime);
            if (!kf) return;
            // `pos` is in world space (Stage carries the camera); the control
            // point offset is stored in the object's LOCAL frame, so map the
            // pointer back through the parent before subtracting.
            const local = worldPointToLocal(
              parentWorld ?? IDENTITY,
              pos.x,
              pos.y
            );
            setKeyframeCp(obj.id, h.kfTime, h.which, {
              dx: local.x - kf.transform.x,
              dy: local.y - kf.transform.y,
            });
          }}
          onDragEnd={() => endInteraction()}
          // Discrete clear: one undoable session (never nest setKeyframeCp
          // inside transaction() — the inner set() races the immer producer
          // and the write is silently lost).
          onDblClick={() => {
            beginInteraction();
            setKeyframeCp(obj.id, h.kfTime, h.which, null);
            endInteraction();
          }}
          onDblTap={() => {
            beginInteraction();
            setKeyframeCp(obj.id, h.kfTime, h.which, null);
            endInteraction();
          }}
        />
      ))}
    </>
  );
}

export function CanvasStage() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const scene = useSceneStore((s) => s.scene);
  const selectedObjId = useSceneStore((s) => s.selectedObjId);
  const setSelected = useSceneStore((s) => s.setSelected);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const setSelectedIds = useSceneStore((s) => s.setSelectedIds);
  const createObjectOfType = useSceneStore((s) => s.createObjectOfType);
  // Existing spine action — the HUD routes through it; no store changes.
  const updateCamera = useSceneStore((s) => s.updateCamera);
  // Arrow draw tool: when armed, background drags draw tail→head instead of
  // panning (wheel-zoom + HUD zoom/pan stay available).
  const activeTool = useSceneStore((s) => s.activeTool);
  const setTool = useSceneStore((s) => s.setTool);

  const { worldSize } = scene;
  const selected = selectedObject({ selectedObjId, scene });
  // Resolved library asset for the selected object (sizes the selection box +
  // gizmo handles to the painted sprite when the object is asset-backed).
  const selectedAsset = selected?.assetId
    ? scene.assets[selected.assetId]
    : undefined;

  // The imported battlefield map (data: URL asset) rendered under everything.
  const mapAssetId = useSceneStore((s) => s.scene.mapAssetId);
  const mapImg = useMapImage(
    mapAssetId ? scene.assets[mapAssetId]?.src : undefined
  );

  // ---- Camera (world-space camera, PRD §87) ----
  // The camera viewport is the Stage's own pixel space (Konva reports pointer
  // positions there), so pan/zoom math stays consistent regardless of the CSS
  // preview scale applied to the wrapper below. `stageProps` positions the
  // world; wheel + background-drag handlers below drive `zoomAt`/`panBy`.
  const vp = { width: worldSize.w, height: worldSize.h };

  // ---- Animated camera (camera track, PRD §87 + P1) ----
  // With a track present the stage DISPLAYS the track evaluated at the
  // playhead — unless the user is actively navigating (pan/wheel/HUD), in
  // which case it shows the live base camera they are editing. Navigation
  // keeps a short grace window so a wheel burst does not flicker back.
  const [navigating, setNavigating] = useState(false);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markNavigating = (): void => {
    if (!hasCameraTrack(scene)) return;
    setNavigating(true);
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => setNavigating(false), 400);
  };
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  // Audio engine: syncs HTMLAudioElement instances with the timeline.
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  useEffect(() => {
    const engine = engineRef.current!;
    engine.sync(
      scene.audioTracks ?? [],
      scene.assets,
      currentTime,
      isPlaying,
    );
  }, [scene.audioTracks, scene.assets, currentTime, isPlaying]);
  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);
  const keyedCamera = useMemo(
    () => getCameraAtTime(scene, currentTime),
    [scene, currentTime]
  );
  const displayCamera =
    hasCameraTrack(scene) && !navigating ? keyedCamera : scene.camera;

  const { stageProps, panBy: panByBase, zoomAt: zoomAtBase } = useCamera(
    vp,
    displayCamera
  );
  const panBy = (dx: number, dy: number): void => {
    markNavigating();
    panByBase(dx, dy);
  };
  const zoomAt = (factor: number, at: { x: number; y: number }): void => {
    markNavigating();
    zoomAtBase(factor, at);
  };
  const viewCenter = { x: worldSize.w / 2, y: worldSize.h / 2 };

  // ---- HUD actions (same clamped math as wheel-zoom; MIN/MAX unchanged) ----
  const zoomStepIn = (): void => zoomAt(ZOOM_STEP, viewCenter);
  const zoomStepOut = (): void => zoomAt(1 / ZOOM_STEP, viewCenter);
  const resetView = (): void => {
    markNavigating();
    updateCamera(() =>
      resetCamera({ x: worldSize.w / 2, y: worldSize.h / 2 })
    );
  };

  const panMovedRef = useRef(false);
  // A Konva node drag that ends over empty canvas still fires a stage `click`
  // whose target === Stage — handleStageClick would then wipe the selection
  // the user just dragged. ObjectNode sets this on its FIRST real DragMove;
  // handleStageClick swallows exactly that one trailing click.
  const bodyDragMovedRef = useRef(false);
  const panHandlers = useCameraPan({
    getPointer: () => stageRef.current?.getPointerPosition() ?? null,
    onPan: (dx, dy) => {
      if (dx !== 0 || dy !== 0) panMovedRef.current = true;
      panBy(dx, dy);
    },
  });

  // ---- Arrow draw gesture ----
  // Tail is captured on pointer-down in WORLD space; every move re-projects
  // the pointer so the ghost stays glued to the cursor at any pan/zoom.
  const arrowTailRef = useRef<{ x: number; y: number } | null>(null);
  const [arrowHead, setArrowHead] = useState<{ x: number; y: number } | null>(
    null
  );
  // Finishing a drag emits a browser `click` right after our mouseup; without
  // this flag handleStageClick would immediately clear the selection we just
  // made for the brand-new arrow.
  const suppressNextClickRef = useRef(false);

  // ---- Marquee box-select (empty-canvas drag; Space+drag / middle = pan) ----
  // Plain left-drag on empty canvas draws a rubber-band box; on release the
  // objects whose world anchors fall inside are selected as a unit (roots, so
  // grouped members select the whole group). The box itself renders via
  // <MarqueeOverlay>; gesture state lives here.
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeMovedRef = useRef(false);
  const [marqueeRect, setMarqueeRect] = useState<WorldRect | null>(null);

  useEffect(() => bindSpaceHold(), []);

  // Figma-style keyboard nudge: arrows move the selection 1px (Shift = 10px)
  // as ONE undo step per press. Group law holds: a grouped child nudges its
  // whole root; multi-selections move together via moveObjectsBy.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      )
        return;
      if (
        e.key !== 'ArrowUp' &&
        e.key !== 'ArrowDown' &&
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowRight'
      )
        return;
      const st = useSceneStore.getState();
      if (!st.selectedObjId || !st.scene.objects[st.selectedObjId]) return;
      // Don't fight text cursors or the path tool's waypoint flow.
      if (st.activeTool === 'path' || st.activeTool === 'freehand') return;
      e.preventDefault();
      const step = nudgeStep(e.shiftKey);
      const dx =
        e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      st.beginInteraction();
      try {
        if (st.selectedIds.length > 1) {
          st.moveObjectsBy(st.selectedIds, dx, dy);
        } else {
          st.moveGroup(groupRootOf(st.scene.objects, st.selectedObjId), dx, dy);
        }
      } finally {
        st.endInteraction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const clearMarquee = (): void => {
    marqueeStartRef.current = null;
    marqueeMovedRef.current = false;
    setMarqueeRect(null);
  };

  const finalizeMarquee = (additive: boolean): void => {
    const rect = marqueeRect;
    clearMarquee();
    if (!rect) return;
    const hits = objectsInWorldRect(scene, rect, currentTime);
    if (additive) {
      // Union: everything already selected stays; new box hits join it.
      const merged = Array.from(new Set([...selectedIds, ...hits]));
      setSelectedIds(merged);
    } else {
      // Replace (Figma-style). An empty box deselects, like an empty-canvas click.
      setSelectedIds(hits);
    }
  };

  /** Pointer position → world coords under the DISPLAYED camera (matches
   * what is on screen — the keyed view when a track drives the stage). */
  const pointerWorld = (): { x: number; y: number } | null => {
    const sp = stageRef.current?.getPointerPosition();
    if (!sp) return null;
    return screenToWorld(sp, displayCamera, vp);
  };

  const finishArrowDraw = (): void => {
    const tail = arrowTailRef.current;
    const head = arrowHead;
    arrowTailRef.current = null;
    setArrowHead(null);
    if (!tail || !head) return;
    suppressNextClickRef.current = true;
    const placement = arrowFromDrag(tail, head);
    if (!placement) return; // Mis-click: too short, discard silently.
    const id = createObjectOfType('arrow', placement);
    setSelected(id);
    setTool('select'); // One arrow per arming — predictable hand-off.
  };

  // ---- Path draw gesture ----
  // Click-to-place-point polyline; double-click finishes; applies position
  // keyframes to the selected object along the drawn path.
  const pathPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const [pathCursor, setPathCursor] = useState<{ x: number; y: number } | null>(null);

  // Freehand draw: hold + drag to draw a movement path.
  const freehandPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const [freehandPreview, setFreehandPreview] = useState<Array<{ x: number; y: number }> | null>(null);

  const finishPathDraw = (): void => {
    const points = pathPointsRef.current;
    pathPointsRef.current = [];
    setPathCursor(null);
    if (points.length < 2) return; // Need ≥2 points for a path.
    suppressNextClickRef.current = true;

    // Apply path as position keyframes to the selected object. When the
    // selection is (or belongs to) a formation/group, the WHOLE unit follows:
    // keyframes land on the group root in world space, and if it has 2+
    // members a snake config is armed so soldiers string out along the drawn
    // road one-behind-another instead of sliding as one rigid block.
    if (selected) {
      const store = useSceneStore.getState();
      const objects = scene.objects;
      const rootId = groupRootOf(objects, selected.id);
      const root = objects[rootId];
      const useWholeUnit = !!root && (root.type === 'group' || rootId !== selected.id);
      const target = useWholeUnit && root ? root : selected;
      const duration = Math.max(scene.timeline.duration, 1);
      const span = duration;
      const legs: number[] = [];
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        const len = dist(points[i - 1], points[i]);
        legs.push(len);
        total += len;
      }
      const kfs: Array<Pick<Keyframe, 'time' | 'transform'>> = [];
      for (let i = 0; i < points.length; i++) {
        let t: number;
        if (total > 0 && i > 0) {
          let cum = 0;
          for (let j = 0; j < i; j++) cum += legs[j];
          t = (cum / total) * span;
        } else {
          t = (i / (points.length - 1)) * span;
        }
        kfs.push({
          time: Math.round(t * 100) / 100,
          transform: {
            x: points[i].x,
            y: points[i].y,
            rotation: target.transform.rotation,
            scale: target.transform.scale,
            opacity: target.transform.opacity,
          },
        });
      }
      const snake = useWholeUnit ? snakeConfigForGroup(target, objects) : null;
      store.applyPathKeyframes(
        target.id,
        kfs,
        snake ? { trainFollow: snake } : undefined
      );
      // Feedback: show toast with keyframe count.
      useSceneStore.setState({ lastAutoKfCount: kfs.length });
    }
    setTool('select');
  };

  /** Freehand draw: simplify stroke → generate keyframes → auto-smooth. */
  const finishFreehandDraw = (): void => {
    const rawPoints = freehandPointsRef.current;
    freehandPointsRef.current = [];
    setFreehandPreview(null);
    if (rawPoints.length < 2) return;
    suppressNextClickRef.current = true;

    // Simplify: reduce dense freehand points to ~10-20 waypoints.
    const points = simplifyPath(rawPoints, 15);

    // Apply as position keyframes (reuse the same logic as finishPathDraw).
    if (selected) {
      const store = useSceneStore.getState();
      const objects = scene.objects;
      const rootId = groupRootOf(objects, selected.id);
      const root = objects[rootId];
      const useWholeUnit = !!root && (root.type === 'group' || rootId !== selected.id);
      const target = useWholeUnit && root ? root : selected;
      const duration = Math.max(scene.timeline.duration, 1);
      const span = duration;
      const legs: number[] = [];
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        const len = dist(points[i - 1], points[i]);
        legs.push(len);
        total += len;
      }
      const kfs: Array<Pick<Keyframe, 'time' | 'transform'>> = [];
      for (let i = 0; i < points.length; i++) {
        let t: number;
        if (total > 0 && i > 0) {
          let cum = 0;
          for (let j = 0; j < i; j++) cum += legs[j];
          t = (cum / total) * span;
        } else {
          t = (i / (points.length - 1)) * span;
        }
        kfs.push({
          time: Math.round(t * 100) / 100,
          transform: {
            x: points[i].x,
            y: points[i].y,
            rotation: target.transform.rotation,
            scale: target.transform.scale,
            opacity: target.transform.opacity,
          },
        });
      }
      const snake = useWholeUnit ? snakeConfigForGroup(target, objects) : null;
      store.applyPathKeyframes(
        target.id,
        kfs,
        snake ? { trainFollow: snake } : undefined
      );
      useSceneStore.setState({ lastAutoKfCount: kfs.length });
    }
    setTool('select');
  };

  /** Ghost line while drawing (world coords, rendered non-interactively). */
  const ghost =
    arrowTailRef.current && arrowHead
      ? {
          tail: arrowTailRef.current,
          head: arrowHead,
        }
      : null;

  /** Path preview while drawing — committed points + trailing cursor line. */
  const pathPreview =
    activeTool === 'path' && pathPointsRef.current.length > 0
      ? { points: pathPointsRef.current, cursor: pathCursor }
      : null;

  /** True when this event hit the EMPTY canvas rather than an object. */
  const isBackgroundTarget = (
    e: KonvaEventObject<MouseEvent | WheelEvent>
  ): boolean => e.target === e.target.getStage();

  // Selected object's composed transforms — shared by outline, gizmos, HUD.
  const selectedWorldT = selected
    ? resolveWorldTransform(scene.objects, selected.id)
    : null;
  const selectedParentFrame =
    selected?.parentId
      ? resolveWorldTransform(scene.objects, selected.parentId)
      : null;

  // Double-click: finish path draw (if active) or reset view on empty canvas.
  // Skipped right after a pan so a drag ending in a quick second press can't
  // teleport the view.
  const handleStageDblClick = (e: KonvaEventObject<MouseEvent>): void => {
    if (activeTool === 'path') {
      // Remove the point added by the click that preceded this dblClick,
      // then finish with the remaining points.
      pathPointsRef.current.pop();
      finishPathDraw();
      return;
    }
    if (!isBackgroundTarget(e) || panMovedRef.current) return;
    resetView();
  };

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    // The click that follows a completed arrow draw must not wipe the
    // selection that draw just made.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    // While the arrow or path tool is armed the gesture handlers own background
    // clicks — never clear selection.
    if (activeTool === 'arrow' || activeTool === 'path') return;
    // A background pan ends with a click on the empty canvas — don't punish
    // the gesture by clearing the current selection.
    if (panMovedRef.current) {
      panMovedRef.current = false;
      return;
    }
    // A marquee box-select release ends with a click too — same rule.
    if (marqueeMovedRef.current) {
      marqueeMovedRef.current = false;
      return;
    }
    // A body-drag that landed on empty canvas emits one trailing click on the
    // empty Stage — swallow it so the selection survives the drop.
    if (bodyDragMovedRef.current) {
      bodyDragMovedRef.current = false;
      return;
    }
    // Click on empty canvas (target === Stage) clears the selection AND
    // exits solo-edit mode (CapCut drag law: back to group-level drags).
    if (e.target === e.target.getStage()) {
      setSelected(null);
      useSoloEditStore.getState().exit();
    }
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const sp = stageRef.current?.getPointerPosition();
    if (!sp) return;
    // Firefox reports wheel deltas in LINE units — normalize to pixels first
    // or one notch would zoom ~0.45% (effectively broken).
    const dyPx = normalizeWheelDelta(e.evt.deltaY, e.evt.deltaMode);
    zoomAt(wheelDeltaToFactor(dyPx), sp);
  };

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Library asset drag (AssetsPanel): place a marker referencing the asset.
    const assetId = e.dataTransfer.getData(ASSET_DND_MIME);
    // Drop point → stage pixels → world coords through the CURRENT camera,
    // so objects land under the cursor at any pan/zoom.
    //
    // MEASURE THE CONTENT ELEMENT, not container(): Konva's container div is
    // a plain block whose layout width follows the CSS wrapper (~958px here),
    // so under the scale(0.5) preview its visual rect gives a wrong
    // stage/visual ratio for X. `.konvajs-content` carries the true
    // stage-sized layout box — the same element Konva's own pointer math
    // uses. (Audit finding: objects landed at viewport centre-X regardless
    // of cursor before this fix.)
    const stage = stageRef.current;
    const container = stage?.container();
    if (!stage || !container) return;
    const content =
      (stage as unknown as { content?: HTMLDivElement }).content ??
      container.querySelector<HTMLDivElement>(':scope > .konvajs-content') ??
      container;
    const rect = content.getBoundingClientRect();
    const sp = clientToStagePoint(
      rect,
      stage.width(),
      stage.height(),
      e.clientX,
      e.clientY,
    );
    const world = screenToWorld(sp, displayCamera, vp);

    if (assetId) {
      // A sprite dropped from the library: place it as a UNIT when its card
      // advertised a unit (text/plain === 'unit'), otherwise as a MARKER.
      // Either way, carry the asset's faction metadata onto the object so the
      // editor + render doors agree on the ring colour.
      const hint = e.dataTransfer.getData('text/plain');
      const placeAs: SceneObjectType = hint === 'unit' ? 'unit' : 'marker';
      const asset = scene.assets[assetId];
      const faction = asset?.metadata?.faction;
      const id = createObjectOfType(placeAs, {
        assetId,
        faction,
        x: world.x,
        y: world.y,
        scale: 0.3,
      });
      setSelected(id);
      return;
    }

    const type = e.dataTransfer.getData('text/plain') as SceneObjectType;
    // Palette allow-list; 'unit' is a valid (sprite) drop target too.
    if (
      type !== 'shape' &&
      type !== 'marker' &&
      type !== 'arrow' &&
      type !== 'unit'
    )
      return;
    const id = createObjectOfType(type, { x: world.x, y: world.y });
    setSelected(id);
  };

  // Escape key cancels in-progress path drawing.
  useEffect(() => {
    if (activeTool !== 'path') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pathPointsRef.current = [];
        setPathCursor(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTool, setTool]);

  // Consume pending path waypoint from ObjectNode double-click during path
  // drawing. The waypoint is set on the store by ObjectNode.handleDblClick.
  useEffect(() => {
    const pt = useSceneStore.getState().pendingPathWaypoint;
    if (pt && activeTool === 'path') {
      pathPointsRef.current.push(pt);
      useSceneStore.getState().setPendingPathWaypoint(null);
    }
  });

  const verticalLines: ReactNode[] = [];
  for (let gx = GRID_STEP; gx < worldSize.w; gx += GRID_STEP) {
    verticalLines.push(
      <Line key={`v${gx}`} points={[gx, 0, gx, worldSize.h]} stroke="#1e293b" strokeWidth={1} />
    );
  }
  const horizontalLines: ReactNode[] = [];
  for (let gy = GRID_STEP; gy < worldSize.h; gy += GRID_STEP) {
    horizontalLines.push(
      <Line key={`h${gy}`} points={[0, gy, worldSize.w, gy]} stroke="#1e293b" strokeWidth={1} />
    );
  }

  return (
    <div
      className="canvas-wrap"
      style={{
        width: worldSize.w * DISPLAY_SCALE,
        height: worldSize.h * DISPLAY_SCALE,
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        style={{
          transform: `scale(${DISPLAY_SCALE})`,
          transformOrigin: 'top left',
        }}
      >
        <Stage
          ref={stageRef}
          width={worldSize.w}
          height={worldSize.h}
          {...stageProps}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onDblClick={handleStageDblClick}
          onDblTap={handleStageDblClick}
          onWheel={handleWheel}
          onMouseDown={(e) => {
            // Freehand tool: background press starts a draw gesture.
            if (activeTool === 'freehand') {
              if (e.target !== e.target.getStage()) return;
              const world = pointerWorld();
              if (!world) return;
              freehandPointsRef.current = [world];
              setFreehandPreview([world]);
              return;
            }
            // Path tool: background click adds a waypoint.
            if (activeTool === 'path') {
              if (e.target !== e.target.getStage()) return;
              const world = pointerWorld();
              if (!world) return;
              pathPointsRef.current.push(world);
              return;
            }
            // Arrow tool: a background press starts a draw gesture instead of
            // a pan; object presses stay object drags.
            if (activeTool === 'arrow') {
              if (e.target !== e.target.getStage()) return;
              const world = pointerWorld();
              if (!world) return;
              arrowTailRef.current = world;
              setArrowHead(world);
              return;
            }
            // Select tool. Empty-canvas presses start a marquee box-select;
            // Space+drag or middle-mouse pans the camera instead. Object
            // presses stay object drags.
            if (e.target === e.target.getStage()) {
              const world = pointerWorld();
              const isPanGesture =
                isSpaceDown() || (e.evt as MouseEvent).button === 1;
              if (isPanGesture || !world) {
                panHandlers.onPointerDown();
              } else {
                marqueeStartRef.current = world;
                setMarqueeRect(worldRectFromPoints(world, world));
              }
            }
          }}
          onMouseMove={() => {
            // Freehand tool: append points during drag.
            if (activeTool === 'freehand' && freehandPointsRef.current.length > 0) {
              const world = pointerWorld();
              if (!world) return;
              const pts = freehandPointsRef.current;
              const last = pts[pts.length - 1];
              // Skip if too close (< 5 world units) to avoid excessive density.
              if (dist(last, world) < 5) return;
              pts.push(world);
              setFreehandPreview([...pts]);
              return;
            }
            // Path tool: show trailing cursor preview line.
            if (activeTool === 'path' && pathPointsRef.current.length > 0) {
              const world = pointerWorld();
              if (world) setPathCursor(world);
              return;
            }
            if (arrowTailRef.current) {
              const world = pointerWorld();
              if (world) setArrowHead(world);
              return;
            }
            if (marqueeStartRef.current) {
              const world = pointerWorld();
              if (world) {
                const rect = worldRectFromPoints(marqueeStartRef.current, world);
                if (
                  rect.maxX - rect.minX > 0.5 ||
                  rect.maxY - rect.minY > 0.5
                ) {
                  marqueeMovedRef.current = true;
                }
                setMarqueeRect(rect);
              }
              return;
            }
            panHandlers.onPointerMove();
          }}
          onMouseUp={(e) => {
            // Freehand tool: finalize the drawn path.
            if (activeTool === 'freehand' && freehandPointsRef.current.length > 0) {
              finishFreehandDraw();
              return;
            }
            if (arrowTailRef.current) {
              finishArrowDraw();
              return;
            }
            if (marqueeStartRef.current) {
              finalizeMarquee((e.evt as MouseEvent).shiftKey);
              return;
            }
            panHandlers.onPointerUp();
          }}
          onMouseLeave={(e) => {
            if (arrowTailRef.current) {
              finishArrowDraw();
              return;
            }
            if (marqueeStartRef.current) {
              // Leaving mid-drag finalizes what was boxed so far (less
              // surprising than silently losing the gesture) — but only once
              // the box actually grew. A spurious leave right after press
              // (the marquee Layer mount re-renders Konva's content DOM, which
              // can fire a synthetic mouseleave) must not swallow the gesture
              // or fall through to pan; it just cancels.
              if (marqueeMovedRef.current) {
                finalizeMarquee((e.evt as MouseEvent).shiftKey);
              } else {
                clearMarquee();
              }
              return;
            }
            panHandlers.onPointerUp();
          }}
        >
          {/* World background, battlefield map, then grid (non-interactive). */}
          <Layer listening={false}>
            <Rect x={0} y={0} width={worldSize.w} height={worldSize.h} fill="#0b1020" />
            {mapImg && (
              <KonvaImage
                image={mapImg}
                x={0}
                y={0}
                width={worldSize.w}
                height={worldSize.h}
              />
            )}
            {verticalLines}
            {horizontalLines}
            <Rect
              x={0}
              y={0}
              width={worldSize.w}
              height={worldSize.h}
              stroke="#334155"
              strokeWidth={2}
              fillEnabled={false}
            />
          </Layer>

          {/* One Konva layer per visible scene layer. Each gets the PARALLAX
              transform derived from its depthFactor via the SAME shared pure
              engine the Remotion render uses (Law 1) — identity when the
              factor is default. */}
          {visibleLayersOrdered(scene).map((layer) => {
            const pT = parallaxLayerTransform(
              displayCamera,
              layerCamera(displayCamera, layer, worldSize)
            );
            return (
            <Layer
              key={layer.id}
              x={pT.x}
              y={pT.y}
              scaleX={pT.scaleX}
              scaleY={pT.scaleY}
              rotation={pT.rotation}
            >
               {objectsForLayer(scene, layer.id).map((obj) => {
                 const worldT = getObjectWorldTransformAtTime(scene, obj.id, currentTime);
                 const parentWorldT = obj.parentId
                   ? getObjectWorldTransformAtTime(scene, obj.parentId, currentTime)
                   : null;
                 // Editor shadow preview (Tab D): mirror the Remotion render's
                 // asset-driven `defaultShadow` so the canvas matches the export.
                 const asset = obj.assetId ? scene.assets[obj.assetId] : undefined;
                 const wantShadow = asset?.metadata?.defaultShadow === true;
                 const shadowZoom = scene.camera.zoom * DISPLAY_SCALE;
                  return (
                    <ObjectNode
                      key={obj.id}
                      obj={obj}
                      world={worldT}
                      parentWorld={parentWorldT}
                      wantShadow={wantShadow}
                      shadowZoom={shadowZoom}
                      onSelect={setSelected}
                      onBodyDragMoved={() => (bodyDragMovedRef.current = true)}
                    />
                  );
                })}
             </Layer>
            );
          })}

          {/* Arrow-draw ghost preview (non-interactive, topmost under HUD). */}
          <Layer listening={false}>
            {ghost && (
              <Group>
                <Line
                  points={[
                    ghost.tail.x,
                    ghost.tail.y,
                    ghost.head.x,
                    ghost.head.y,
                  ]}
                  stroke={DEFAULT_ARROW_COLOR}
                  strokeWidth={4}
                  opacity={0.6}
                  dash={[10, 8]}
                  lineCap="round"
                />
                {/* Tail anchor dot so the gesture origin is visible. */}
                <Group x={ghost.tail.x} y={ghost.tail.y}>
                  <Line
                    points={[-6, 0, 6, 0, 0, -6, -6, 0]}
                    fill={DEFAULT_ARROW_COLOR}
                    opacity={0.8}
                  />
                </Group>
              </Group>
            )}
          </Layer>

          {/* Path-draw preview (non-interactive): committed polyline + cursor trail. */}
          <Layer listening={false}>
            {pathPreview && (
              <Group>
                {/* Committed path segments. */}
                {pathPreview.points.length >= 2 && (
                  <Line
                    points={pathPreview.points.flatMap((p) => [p.x, p.y])}
                    stroke="#4d8dff"
                    strokeWidth={3}
                    opacity={0.7}
                    dash={[10, 6]}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}
                {/* Waypoint dots. */}
                {pathPreview.points.map((p, i) => (
                  <Circle
                    key={i}
                    x={p.x}
                    y={p.y}
                    radius={5}
                    fill="#4d8dff"
                    opacity={0.9}
                  />
                ))}
                {/* Trailing cursor line (last point → cursor). */}
                {pathPreview.cursor && pathPreview.points.length > 0 && (
                  <Line
                    points={[
                      pathPreview.points[pathPreview.points.length - 1].x,
                      pathPreview.points[pathPreview.points.length - 1].y,
                      pathPreview.cursor.x,
                      pathPreview.cursor.y,
                    ]}
                    stroke="#4d8dff"
                    strokeWidth={2}
                    opacity={0.4}
                    dash={[6, 4]}
                    lineCap="round"
                  />
                )}
              </Group>
            )}
          </Layer>

          {/* Freehand-draw preview: solid blue line following the stroke. */}
          <Layer listening={false}>
            {activeTool === 'freehand' && freehandPreview && freehandPreview.length >= 2 && (
              <Line
                points={freehandPreview.flatMap((p) => [p.x, p.y])}
                stroke="#4d8dff"
                strokeWidth={3}
                opacity={0.7}
                lineCap="round"
                lineJoin="round"
              />
            )}
          </Layer>

          {/* Group overlay: dashed AABB + spokes for groups (non-interactive). */}
          <Layer listening={false}>
            <GroupOverlay scene={scene} currentTime={currentTime} />
          </Layer>

          {/* Battle FX: deterministic burst rings for active effect instances. */}
          <Layer listening={false}>
            <EffectOverlay scene={scene} time={currentTime} />
          </Layer>

          {/* Selection outline on top (non-interactive). */}
          <Layer listening={false}>
            {selected && selectedWorldT && (
              <SelectionOutline obj={selected} world={selectedWorldT} asset={selectedAsset} />
            )}
          </Layer>

          {/* Shapes-panel formation guide: ghosts for the targeted shape group. */}
          <Layer listening={false}>
            <ShapeGuideOverlay scene={scene} currentTime={currentTime} />
          </Layer>

          {/* Marquee box-select preview (while dragging on empty canvas). */}
          {marqueeRect && (
            <Layer listening={false}>
              <MarqueeOverlay rect={marqueeRect} />
            </Layer>
          )}

          {/* Animated-camera trajectory preview (non-interactive, editor only). */}
          <Layer listening={false}>
            <CameraPathOverlay scene={scene} currentTime={currentTime} />
          </Layer>

          {/* Curved-path handles for the selected object (interactive). */}
          <Layer>
            {selected && (
              <PathHandles
                obj={selected}
                parentWorld={
                  selected.parentId
                    ? resolveWorldTransform(scene.objects, selected.parentId)
                    : null
                }
              />
            )}
          </Layer>

          {/* Persistent waypoint polyline + draggable handles (selected object, ≥2 keyframes). */}
          <Layer>
            {selected &&
              (scene.keyframes[selected.id]?.length ?? 0) >= 2 &&
              !(activeTool === 'path' && pathPreview) && (
                <WaypointHandles obj={selected} parentWorld={selectedParentFrame} />
              )}
          </Layer>

          {/* Transform gizmos (interactive, topmost): corner-scale + rotate. */}
          <Layer>
            {selected &&
              selectedWorldT &&
              activeTool !== 'arrow' && (
                <SelectionGizmos
                  obj={selected}
                  worldT={selectedWorldT}
                  parentFrame={selectedParentFrame}
                  pointerWorld={pointerWorld}
                  asset={selectedAsset}
                />
              )}
          </Layer>
        </Stage>
      </div>

      {/* Camera affordances float above the canvas. Mounted OUTSIDE the
          scale(0.5) proxy wrapper so they keep natural DOM sizing. */}
      {scene.vignette && <div className="vignette-overlay" data-testid="vignette-overlay" />}
      <CameraHud
        onZoomIn={zoomStepIn}
        onZoomOut={zoomStepOut}
        onResetView={resetView}
      />

      {/* Selection HUD: live X/Y/SCL/ROT scrubbers next to the object —
          feedback lands where the user is already looking. Also OUTSIDE the
          scaled wrapper (natural DOM sizing). */}
      {selected && selectedWorldT && (
        <SelectionHud
          obj={selected}
          worldT={selectedWorldT}
          displayCamera={displayCamera}
          vp={vp}
          displayScale={DISPLAY_SCALE}
          wrapWidth={worldSize.w * DISPLAY_SCALE}
        />
      )}
    </div>
  );
}

export default CanvasStage;
