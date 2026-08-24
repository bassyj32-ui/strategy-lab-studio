import { Group, Rect, Ellipse, Text, Line, Image as KonvaImage } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { ObjId, SceneObject, Transform } from '../scene/types';
import { useSceneStore } from '../scene/store';
import { worldPointToLocal } from './groups';
import { useMapImage } from '../canvas/useMapImage';
// Unified selection: canvas clicks must reach BOTH the scene store (canvas
// highlight + Inspector) and the timeline selection store (KeyframeEditor).
import { selectObjectUnified } from '../timeline/selection';

// Base sizes in world units (object center sits at transform.x / transform.y).
export const SHAPE_SIZE = 80;
export const MARKER_RADIUS = 36;
// Arrow geometry in LOCAL world units (tail at local origin, tip at +X).
export const ARROW_SHAFT_WIDTH = 6;
export const ARROWHEAD_LENGTH = 18;
export const ARROWHEAD_HALF_WIDTH = 11;

// Editor preview shadows mirror the Remotion render (src/render/draw.ts) so
// what the commander sees matches the export. Keep these four in sync with the
// render constants (SHADOW_* in draw.ts).
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.45)';
const SHADOW_BLUR = 12;
const SHADOW_OFFSET_X = 4;
const SHADOW_OFFSET_Y = 6;

interface ObjectNodeProps {
  obj: SceneObject;
  /** WORLD-space transform to render at (parent chain already folded). */
  world: Transform;
  /** WORLD transform of this object's parent, or null if it is a root. */
  parentWorld: Transform | null;
  /**
   * Preview shadows whose asset declares `defaultShadow` (Tab D render-only
   * shadows, now surfaced in the editor too). `shadowZoom` is the camera
   * zoom × display scale so the preview tracks the render's screen.scale.
   */
  wantShadow?: boolean;
  shadowZoom?: number;
  onSelect: (id: ObjId) => void;
}

/**
 * A single battlefield object rendered as a Konva node (NOT React DOM).
 * The transform.x / transform.y is treated as the object's CENTER so that the
 * selection outline and all object kinds share one coordinate convention.
 *
 * `world` is the object's world transform (parent chain folded in) so grouped
 * children render at their true on-screen position. The drag handler converts
 * the pointer's world position back into the object's LOCAL frame before
 * writing, so grouping is preserved while dragging.
 */
export function ObjectNode({
  obj,
  world,
  parentWorld,
  wantShadow,
  shadowZoom = 1,
  onSelect,
}: ObjectNodeProps) {
  const beginInteraction = useSceneStore((s) => s.beginInteraction);
  const endInteraction = useSceneStore((s) => s.endInteraction);
  const updateTransform = useSceneStore((s) => s.updateTransform);

  // Asset-backed objects (Tab F forward item): resolve the library asset and
  // load its image so the editor paints the SAME pixels the export will
  // (draw.ts draws the image whenever one resolves, for any object type).
  const asset = useSceneStore((s) =>
    obj.assetId ? s.scene.assets[obj.assetId] : undefined
  );
  const img = useMapImage(asset?.src);

  const { x, y, rotation, scale, opacity } = world;

  const handleDragStart = () => {
    beginInteraction();
  };

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    // Live-sync the store so the selection outline follows during the drag.
    // No extra history is pushed: only the begin snapshot matters. The node
    // position is in WORLD space (the Stage carries the camera); convert it
    // into the object's local frame before storing.
    const node = e.target;
    const parent = parentWorld ?? { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };
    const local = worldPointToLocal(parent, node.x(), node.y());
    updateTransform(obj.id, { x: local.x, y: local.y });
  };

  const handleDragEnd = () => {
    endInteraction();
  };

  const handleSelect = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    // SINGLE CHOKE POINT for canvas selection: sync both stores here so the
    // Inspector, canvas outline and timeline always agree, no matter which
    // parent supplies `onSelect`.
    selectObjectUnified(obj.id);
    // Keep the parent contract (CanvasStage passes scene setSelected — an
    // idempotent re-write of the same value).
    onSelect(obj.id);
  };

  const common = {
    x,
    y,
    rotation,
    scaleX: scale,
    scaleY: scale,
    opacity,
    draggable: true,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
    onClick: handleSelect,
    onTap: handleSelect,
    ...(wantShadow
      ? {
          shadowColor: SHADOW_COLOR,
          shadowBlur: SHADOW_BLUR * shadowZoom,
          shadowOffsetX: SHADOW_OFFSET_X * shadowZoom,
          shadowOffsetY: SHADOW_OFFSET_Y * shadowZoom,
        }
      : {}),
  };

  // Image-backed object: paint the asset image centred on the transform
  // (same precedence as the Remotion path — the image wins over vector
  // placeholders). Local units: the Group's scale already applies camera/
  // display scaling, so width/height stay in world units.
  if (img && asset) {
    return (
      <Group {...common}>
        <KonvaImage
          image={img}
          width={asset.width}
          height={asset.height}
          offsetX={asset.width / 2}
          offsetY={asset.height / 2}
        />
      </Group>
    );
  }

  if (obj.type === 'shape') {
    return (
      <Group {...common}>
        <Rect
          x={-SHAPE_SIZE / 2}
          y={-SHAPE_SIZE / 2}
          width={SHAPE_SIZE}
          height={SHAPE_SIZE}
          fill="#3b82f6"
          cornerRadius={4}
        />
      </Group>
    );
  }

  if (obj.type === 'marker') {
    return (
      <Group {...common}>
        <Ellipse radiusX={MARKER_RADIUS} radiusY={MARKER_RADIUS} fill="#ef4444" />
      </Group>
    );
  }

  // Attack/movement arrow (MVP-2). Unlike the other kinds, transform.x/y is
  // the TAIL anchor (rotation pivots the whole arrow around where it starts);
  // the tip sits `length` local units along +X.
  if (obj.type === 'arrow') {
    const len = obj.length ?? 120;
    const color = obj.color ?? '#f5a83c';
    return (
      <Group {...common}>
        <Line
          points={[0, 0, len, 0]}
          stroke={color}
          strokeWidth={ARROW_SHAFT_WIDTH}
          lineCap="round"
          hitStrokeWidth={24}
        />
        <Line
          points={[
            len,
            0,
            len - ARROWHEAD_LENGTH,
            -ARROWHEAD_HALF_WIDTH,
            len - ARROWHEAD_LENGTH,
            ARROWHEAD_HALF_WIDTH,
          ]}
          closed
          fill={color}
          stroke={color}
          strokeWidth={1}
          hitStrokeWidth={24}
        />
      </Group>
    );
  }

  // unit placeholder (reserved)
  return (
    <Group {...common}>
      <Rect
        x={-SHAPE_SIZE / 2}
        y={-SHAPE_SIZE / 2}
        width={SHAPE_SIZE}
        height={SHAPE_SIZE}
        fill="#9ca3af"
        cornerRadius={4}
      />
      <Text
        text="U"
        fontSize={28}
        fill="#111827"
        width={SHAPE_SIZE}
        height={SHAPE_SIZE}
        offsetX={SHAPE_SIZE / 2}
        offsetY={SHAPE_SIZE / 2}
        align="center"
        verticalAlign="middle"
      />
    </Group>
  );
}

export default ObjectNode;
