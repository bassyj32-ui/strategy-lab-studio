import { Group, Rect, Ellipse, Text, Line, Image as KonvaImage, Circle } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { ReactNode } from 'react';
import type { ObjId, SceneObject, Transform } from '../scene/types';
import { useSceneStore } from '../scene/store';
import { usePlaybackStore } from '../timeline/playbackStore';
import { worldPointToLocal } from './groups';
import {
  CONFIDENCE_META,
  annotationRingRadius,
  labelOffsetY,
  badgeOffsetY,
} from './annotations';
import { useMapImage } from '../canvas/useMapImage';
import { effectRings, effectColor } from './effects';
import { arrowStyleSpec } from './arrowStyles';
import { resolveFactionColors } from '../scene/branding';
import { UNIT_PLACEHOLDER } from '../scene/placeholder';
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
  // UX repair pass: shift-click multi-select + drag-the-selection-as-one.
  const toggleSelected = useSceneStore((s) => s.toggleSelected);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const selectedObjId = useSceneStore((s) => s.selectedObjId);
  const moveObjectsBy = useSceneStore((s) => s.moveObjectsBy);
  // §93 branding: per-scene faction color overrides (falls back to §31).
  const brand = useSceneStore((s) => s.scene.brand);

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
    // Multi-selection move-as-one: dragging any member of a loose multi-
    // selection moves every SELECTION ROOT by the same world delta (the
    // delta self-corrects to zero once the store catches up). Grouped
    // hierarchies already move as one via their parent, so this path only
    // applies to multi-selections.
    if (
      selectedObjId !== null &&
      selectedIds.length > 1 &&
      selectedIds.includes(obj.id)
    ) {
      moveObjectsBy(selectedIds, node.x() - world.x, node.y() - world.y);
      return;
    }
    const parent = parentWorld ?? { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };
    const local = worldPointToLocal(parent, node.x(), node.y());
    updateTransform(obj.id, { x: local.x, y: local.y });
  };

  const handleDragEnd = () => {
    endInteraction();
  };

  const handleSelect = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    // Shift-click ADDS TO / REMOVES FROM the multi-selection without
    // disturbing the primary. Plain click keeps the single choke point.
    if (e.evt?.shiftKey) {
      toggleSelected(obj.id);
      return;
    }
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

  // Body selection mirrors the Remotion path precedence: asset image wins
  // over vector placeholders. Local units: the Group's scale already applies
  // camera/display scaling.
  let body: ReactNode;
  if (img && asset) {
    body = (
      <KonvaImage
        image={img}
        width={asset.width}
        height={asset.height}
        offsetX={asset.width / 2}
        offsetY={asset.height / 2}
      />
    );
  } else if (obj.type === 'shape') {
    body = (
      <Rect
        x={-SHAPE_SIZE / 2}
        y={-SHAPE_SIZE / 2}
        width={SHAPE_SIZE}
        height={SHAPE_SIZE}
        fill="#3b82f6"
        cornerRadius={4}
      />
    );
  } else if (obj.type === 'marker') {
    body = <Ellipse radiusX={MARKER_RADIUS} radiusY={MARKER_RADIUS} fill="#ef4444" />;
  } else if (obj.type === 'arrow') {
    // Attack/movement arrow (MVP-2) + §32 signature styles. Tail at local
    // origin, tip along +X; the style spec fixes thickness/head/opacity/dash
    // so both render doors share one visual language. Spec opacity stacks on
    // the object's own transform opacity.
    const len = obj.length ?? 120;
    const color = obj.color ?? '#f5a83c';
    const spec = arrowStyleSpec(obj.arrowStyle);
    body = (
      <Group opacity={spec.opacity}>
        <Line
          points={[0, 0, len, 0]}
          stroke={color}
          strokeWidth={spec.shaftWidth}
          lineCap="round"
          dash={spec.dash}
          hitStrokeWidth={24}
        />
        <Line
          points={[
            len,
            0,
            len - spec.headLength,
            -spec.headHalfWidth,
            len - spec.headLength,
            spec.headHalfWidth,
          ]}
          closed
          fill={color}
          stroke={color}
          strokeWidth={1}
          hitStrokeWidth={24}
        />
      </Group>
    );
  } else {
    // Asset-less unit placeholder — MUST match render/draw.ts (REV-PASS FIX #1).
    const ph = UNIT_PLACEHOLDER;
    body = (
      <>
        <Rect
          x={-ph.size / 2}
          y={-ph.size / 2}
          width={ph.size}
          height={ph.size}
          fill={ph.color}
          cornerRadius={ph.cornerRadius}
        />
        <Text
          text={ph.label}
          fontSize={ph.labelFontSize}
          fill={ph.labelColor}
          width={ph.size}
          height={ph.size}
          offsetX={ph.size / 2}
          offsetY={ph.size / 2}
          align="center"
          verticalAlign="middle"
        />
      </>
    );
  }

  // Commander annotations (P2 §36/§37). Rendered INSIDE the transform group
  // (so they inherit position/scale/opacity/shadow) but COUNTER-ROTATED so
  // text stays readable at any object/group rotation — matching the export,
  // which paints labels in unrotated screen space.
  const ringR = annotationRingRadius(obj, asset ?? undefined);
  const needsAnnotations = Boolean(obj.faction || obj.label || obj.confidence);
  // §50 effect halo (P2): same pure ring math as the export door, painted as
  // non-interactive circles inside the transform group (rotation-invariant).
  const playbackTime = usePlaybackStore((s) => s.currentTime);
  const rings = obj.effect ? effectRings(obj.effect, playbackTime) : [];
  return (
    <Group {...common}>
      {body}
      {rings.map((ring, i) => (
        <Circle
          key={`fx-${i}`}
          listening={false}
          radius={ringR * ring.radiusFactor}
          fill={obj.effect ? effectColor(obj.effect) : undefined}
          opacity={ring.alpha}
        />
      ))}
      {needsAnnotations && (
        <Group listening={false} rotation={-world.rotation}>
          {obj.faction && (
            <Ellipse
              radiusX={ringR}
              radiusY={ringR}
              stroke={resolveFactionColors(brand)[obj.faction]}
              strokeWidth={3}
              fillEnabled={false}
            />
          )}
          {obj.label && (
            <>
              <Rect
                x={-160}
                y={labelOffsetY(ringR) - 16}
                width={320}
                height={32}
                fill="rgba(11,14,20,0.75)"
                cornerRadius={6}
              />
              <Text
                text={obj.label}
                x={-160}
                y={labelOffsetY(ringR) - 16}
                width={320}
                height={32}
                fontSize={20}
                fontStyle="600"
                fill="#e5e7eb"
                align="center"
                verticalAlign="middle"
                listening={false}
              />
            </>
          )}
          {obj.confidence && (
            <Text
              text={CONFIDENCE_META[obj.confidence].text}
              x={-100}
              y={badgeOffsetY(ringR) - 12}
              width={200}
              height={24}
              fontSize={15}
              fontStyle="700"
              fill={CONFIDENCE_META[obj.confidence].color}
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          )}
        </Group>
      )}
    </Group>
  );
}

export default ObjectNode;
