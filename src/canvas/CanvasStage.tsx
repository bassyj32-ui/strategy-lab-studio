import { useRef } from 'react';
import type { DragEvent as ReactDragEvent, ReactNode } from 'react';
import { Stage, Layer, Rect, Line, Group } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import { useSceneStore } from '../scene/store';
import {
  visibleLayersOrdered,
  objectsForLayer,
  selectedObject,
} from '../scene/selectors';
import { ObjectNode, SHAPE_SIZE, MARKER_RADIUS } from '../objects/ObjectNode';
import type { SceneObject, SceneObjectType } from '../scene/types';
// The camera lives in world space (PRD §87): its state is owned by the scene
// store; this canvas binds it through useCamera and wires interactive
// wheel-zoom + background drag-pan below.
import {
  useCamera,
  screenToWorld,
  wheelDeltaToFactor,
  useCameraPan,
} from '../camera';

// The MVP-1 editor preview is a low-res proxy: show the 1920x1080 world at
// half scale so it fits typical screens (performance budget: MacBook Air M1).
const DISPLAY_SCALE = 0.5;
const GRID_STEP = 120;

/**
 * Map a viewport (clientX/Y) coordinate to STAGE pixel space. Ratio-based so
 * it stays correct under the CSS preview scale (getBoundingClientRect returns
 * the visually scaled size; stage.width() is the unscaled logical size).
 */
function clientToStage(
  stage: Konva.Stage | null,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const container = stage?.container();
  if (!stage || !container) return { x: 0, y: 0 };
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const sx = stage.width() / rect.width;
  const sy = stage.height() / rect.height;
  return {
    x: (clientX - rect.left) * sx,
    y: (clientY - rect.top) * sy,
  };
}

function SelectionOutline({ obj }: { obj: SceneObject }) {
  const { x, y, rotation, scale } = obj.transform;
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

  const { worldSize } = scene;
  const selected = selectedObject({ selectedObjId, scene });

  // ---- Camera (world-space camera, PRD §87) ----
  // The camera viewport is the Stage's own pixel space (Konva reports pointer
  // positions there), so pan/zoom math stays consistent regardless of the CSS
  // preview scale applied to the wrapper below. `stageProps` positions the
  // world; wheel + background-drag handlers below drive `zoomAt`/`panBy`.
  const vp = { width: worldSize.w, height: worldSize.h };
  const { stageProps, panBy, zoomAt } = useCamera(vp);

  const panMovedRef = useRef(false);
  const panHandlers = useCameraPan({
    getPointer: () => stageRef.current?.getPointerPosition() ?? null,
    onPan: (dx, dy) => {
      if (dx !== 0 || dy !== 0) panMovedRef.current = true;
      panBy(dx, dy);
    },
  });

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
    zoomAt(wheelDeltaToFactor(e.evt.deltaY), sp);
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
    const sp = clientToStage(stageRef.current, e.clientX, e.clientY);
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
          {/* Faint world-bounds + grid (non-interactive). */}
          <Layer listening={false}>
            <Rect x={0} y={0} width={worldSize.w} height={worldSize.h} fill="#0b1020" />
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
    </div>
  );
}

export default CanvasStage;
