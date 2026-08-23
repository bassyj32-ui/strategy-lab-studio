import { Group, Rect, Ellipse, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { ObjId, SceneObject } from '../scene/types';
import { useSceneStore } from '../scene/store';
// Unified selection: canvas clicks must reach BOTH the scene store (canvas
// highlight + Inspector) and the timeline selection store (KeyframeEditor).
import { selectObjectUnified } from '../timeline/selection';

// Base sizes in world units (object center sits at transform.x / transform.y).
export const SHAPE_SIZE = 80;
export const MARKER_RADIUS = 36;

interface ObjectNodeProps {
  obj: SceneObject;
  onSelect: (id: ObjId) => void;
}

/**
 * A single battlefield object rendered as a Konva node (NOT React DOM).
 * The transform.x / transform.y is treated as the object's CENTER so that the
 * selection outline and all object kinds share one coordinate convention.
 */
export function ObjectNode({ obj, onSelect }: ObjectNodeProps) {
  const beginInteraction = useSceneStore((s) => s.beginInteraction);
  const endInteraction = useSceneStore((s) => s.endInteraction);
  const updateTransform = useSceneStore((s) => s.updateTransform);

  const { x, y, rotation, scale, opacity } = obj.transform;

  const handleDragStart = () => {
    beginInteraction();
  };

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    // Live-sync the store so the selection outline follows during the drag.
    // No extra history is pushed: only the begin snapshot matters.
    const node = e.target;
    updateTransform(obj.id, { x: node.x(), y: node.y() });
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
  };

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
