import { useRef, useState, useMemo } from 'react';
import type { DragEvent as ReactDragEvent, ReactNode } from 'react';
import {
  Stage,
  Layer,
  Rect,
  Line,
  Group,
  Circle,
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
import {
  ObjectNode,
  SHAPE_SIZE,
  MARKER_RADIUS,
  ARROW_SHAFT_WIDTH,
  ARROWHEAD_HALF_WIDTH,
  ARROWHEAD_LENGTH,
} from '../objects/ObjectNode';
import { DEFAULT_ARROW_LENGTH, DEFAULT_ARROW_COLOR } from '../objects/factory';
import { arrowFromDrag } from '../objects/drawGesture';
import {
  resolveWorldTransform,
  composeTransform,
  worldPointToLocal,
} from '../objects/groups';
import type {
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
import { CameraHud } from './CameraHud';
import { useMapImage } from './useMapImage';

// The MVP-1 editor preview is a low-res proxy: show the 1920x1080 world at
// half scale so it fits typical screens (performance budget: MacBook Air M1).
const DISPLAY_SCALE = 0.5;
const GRID_STEP = 120;

function SelectionOutline({ obj, world }: { obj: SceneObject; world: Transform }) {
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
          stroke="#f5a83c"
          strokeWidth={2}
          strokeScaleEnabled={false}
          fillEnabled={false}
          listening={false}
        />
      </Group>
    );
  }
  let w = SHAPE_SIZE;
  let h = SHAPE_SIZE;
  if (obj.type === 'marker') {
    w = MARKER_RADIUS * 2;
    h = MARKER_RADIUS * 2;
  }
  return (
    <Group x={x} y={y} rotation={rotation} scaleX={scale} scaleY={scale}>
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        stroke="#f5a83c"
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
  const createObjectOfType = useSceneStore((s) => s.createObjectOfType);
  // Existing spine action — the HUD routes through it; no store changes.
  const updateCamera = useSceneStore((s) => s.updateCamera);
  // Arrow draw tool: when armed, background drags draw tail→head instead of
  // panning (wheel-zoom + HUD zoom/pan stay available).
  const activeTool = useSceneStore((s) => s.activeTool);
  const setTool = useSceneStore((s) => s.setTool);

  const { worldSize } = scene;
  const selected = selectedObject({ selectedObjId, scene });

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
  const { stageProps, panBy, zoomAt } = useCamera(vp);
  const viewCenter = { x: worldSize.w / 2, y: worldSize.h / 2 };

  // ---- HUD actions (same clamped math as wheel-zoom; MIN/MAX unchanged) ----
  const zoomStepIn = (): void => zoomAt(ZOOM_STEP, viewCenter);
  const zoomStepOut = (): void => zoomAt(1 / ZOOM_STEP, viewCenter);
  const resetView = (): void =>
    updateCamera(() =>
      resetCamera({ x: worldSize.w / 2, y: worldSize.h / 2 })
    );

  const panMovedRef = useRef(false);
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

  /** Pointer position → world coords under the CURRENT camera. */
  const pointerWorld = (): { x: number; y: number } | null => {
    const sp = stageRef.current?.getPointerPosition();
    if (!sp) return null;
    return screenToWorld(sp, scene.camera, vp);
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

  /** Ghost line while drawing (world coords, rendered non-interactively). */
  const ghost =
    arrowTailRef.current && arrowHead
      ? {
          tail: arrowTailRef.current,
          head: arrowHead,
        }
      : null;

  /** True when this event hit the EMPTY canvas rather than an object. */
  const isBackgroundTarget = (
    e: KonvaEventObject<MouseEvent | WheelEvent>
  ): boolean => e.target === e.target.getStage();

  // Double-click empty canvas = reset view. Skipped right after a pan so a
  // drag ending in a quick second press can't teleport the view.
  const handleStageDblClick = (e: KonvaEventObject<MouseEvent>): void => {
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
    // While the arrow tool is armed the gesture handlers own background
    // clicks (a too-short drag is discarded above) — never clear selection.
    if (activeTool === 'arrow') return;
    // A background pan ends with a click on the empty canvas — don't punish
    // the gesture by clearing the current selection.
    if (panMovedRef.current) {
      panMovedRef.current = false;
      return;
    }
    // Click on empty canvas (target === Stage) clears the selection.
    if (e.target === e.target.getStage()) {
      setSelected(null);
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
    const type = e.dataTransfer.getData('text/plain') as SceneObjectType;
    if (type !== 'shape' && type !== 'marker' && type !== 'arrow') return;
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
    const world = screenToWorld(sp, scene.camera, vp);
    const id = createObjectOfType(type, { x: world.x, y: world.y });
    setSelected(id);
  };

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
            // Only empty-canvas presses start a pan; object drags stay object
            // drags.
            if (e.target === e.target.getStage()) panHandlers.onPointerDown();
          }}
          onMouseMove={() => {
            if (arrowTailRef.current) {
              const world = pointerWorld();
              if (world) setArrowHead(world);
              return;
            }
            panHandlers.onPointerMove();
          }}
          onMouseUp={() => {
            if (arrowTailRef.current) {
              finishArrowDraw();
              return;
            }
            panHandlers.onPointerUp();
          }}
          onMouseLeave={() => {
            if (arrowTailRef.current) {
              finishArrowDraw();
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

          {/* One Konva layer per visible scene layer. */}
          {visibleLayersOrdered(scene).map((layer) => (
            <Layer key={layer.id}>
               {objectsForLayer(scene, layer.id).map((obj) => {
                 const worldT = resolveWorldTransform(scene.objects, obj.id);
                 const parentWorldT = obj.parentId
                   ? resolveWorldTransform(scene.objects, obj.parentId)
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
                   />
                 );
               })}
            </Layer>
          ))}

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

          {/* Selection outline on top (non-interactive). */}
          <Layer listening={false}>
            {selected && (
              <SelectionOutline
                obj={selected}
                world={resolveWorldTransform(scene.objects, selected.id)}
              />
            )}
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
        </Stage>
      </div>

      {/* Camera affordances float above the canvas. Mounted OUTSIDE the
          scale(0.5) proxy wrapper so they keep natural DOM sizing. */}
      <CameraHud
        onZoomIn={zoomStepIn}
        onZoomOut={zoomStepOut}
        onResetView={resetView}
      />
    </div>
  );
}

export default CanvasStage;
