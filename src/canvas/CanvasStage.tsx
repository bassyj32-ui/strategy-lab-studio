import { useRef } from 'react';
import type { DragEvent as ReactDragEvent, ReactNode } from 'react';
import { Stage, Layer, Rect, Line, Group, Image as KonvaImage } from 'react-konva';
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
import { DEFAULT_ARROW_LENGTH } from '../objects/factory';
import type { SceneObject, SceneObjectType } from '../scene/types';
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

function SelectionOutline({ obj }: { obj: SceneObject }) {
  const { x, y, rotation, scale } = obj.transform;
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

export function CanvasStage() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const scene = useSceneStore((s) => s.scene);
  const selectedObjId = useSceneStore((s) => s.selectedObjId);
  const setSelected = useSceneStore((s) => s.setSelected);
  const createObjectOfType = useSceneStore((s) => s.createObjectOfType);
  // Existing spine action — the HUD routes through it; no store changes.
  const updateCamera = useSceneStore((s) => s.updateCamera);

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
    if (type !== 'shape' && type !== 'marker') return;
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
            // Only empty-canvas presses start a pan; object drags stay object
            // drags.
            if (e.target === e.target.getStage()) panHandlers.onPointerDown();
          }}
          onMouseMove={() => panHandlers.onPointerMove()}
          onMouseUp={() => panHandlers.onPointerUp()}
          onMouseLeave={() => panHandlers.onPointerUp()}
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
              {objectsForLayer(scene, layer.id).map((obj) => (
                <ObjectNode
                  key={obj.id}
                  obj={obj}
                  onSelect={setSelected}
                />
              ))}
            </Layer>
          ))}

          {/* Selection outline on top (non-interactive). */}
          <Layer listening={false}>
            {selected && <SelectionOutline obj={selected} />}
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
