import { Group, Rect, Ellipse, Text, Line, Image as KonvaImage, Circle } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { axisLockDelta, snapPos } from '../canvas/gizmo';
import type { ObjId, SceneObject, Transform } from '../scene/types';
import { useSceneStore } from '../scene/store';
import { usePlaybackStore } from '../timeline/playbackStore';
import { worldPointToLocal, groupRootOf, resolveWorldTransform } from './groups';
import { useSoloEditStore } from './soloEdit';
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
import {
  SHADOW_BLUR,
  SHADOW_COLOR,
  SHADOW_OFFSET_X,
  SHADOW_OFFSET_Y,
} from '../render/shadows';
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
// Arrow grab band: just over 2x the thickest shaft (6) so arrows stay easy
// to grab without stealing clicks from units parked alongside them.
// (Was 24 — a ~14px invisible force field that swallowed nearby drags.)
export const ARROW_HIT_WIDTH = 12;

// Editor preview shadows mirror the Remotion render (src/render/draw.ts) so
// what the commander sees matches the export. Values live in
// src/render/shadows.ts — the single shared module both doors import.

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
  /**
   * Fired on the first real DragMove of a body drag (not on plain clicks).
   * CanvasStage uses it to suppress the stage click that Konva emits when a
   * node drag ends over empty canvas — without this, dropping an object onto
   * empty space would instantly clear the selection that was just dragged.
   */
  onBodyDragMoved?: () => void;
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
  onBodyDragMoved,
}: ObjectNodeProps) {
  const beginInteraction = useSceneStore((s) => s.beginInteraction);
  const endInteraction = useSceneStore((s) => s.endInteraction);
  const updateTransform = useSceneStore((s) => s.updateTransform);
  // UX repair pass: shift-click multi-select + drag-the-selection-as-one.
  const toggleSelected = useSceneStore((s) => s.toggleSelected);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const selectedObjId = useSceneStore((s) => s.selectedObjId);
  const moveObjectsBy = useSceneStore((s) => s.moveObjectsBy);
  // CapCut drag law: full hierarchy lookup + group-move action.
  const objects = useSceneStore((s) => s.scene.objects);
  const moveGroup = useSceneStore((s) => s.moveGroup);
  const soloRoot = useSoloEditStore((s) => s.rootId);
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
  const duplicateObject = useSceneStore((s) => s.duplicateObject);

  // Figma-style body drag: gesture-total delta from dragstart (no incremental
  // drift), Shift = axis lock, Alt = duplicate-drag, 1px snap kills jitter.
  const bodyDragRef = useRef<{
    startWx: number;
    startWy: number;
    /** Store anchor at gesture start (frozen — the live `world` prop moves). */
    startX: number;
    startY: number;
    lastDx: number;
    lastDy: number;
    altCopyId: ObjId | null;
  } | null>(null);

  const handleDragStart = (e: KonvaEventObject<DragEvent>) => {
    const node = e.target;
    let altCopyId: ObjId | null = null;
    let startX = world.x;
    let startY = world.y;
    // Alt-drag duplicates FIRST, then the gesture drags the fresh copy —
    // the original never moves. The duplicate pushes its own history entry
    // directly (it runs BEFORE beginInteraction opens the drag session).
    if ((e.evt as MouseEvent)?.altKey) {
      altCopyId = duplicateObject(obj.id);
      if (altCopyId) {
        // Anchor the gesture on the COPY's world pose (store nudges it
        // +24,+24 so it doesn't sit exactly under the original).
        const after = useSceneStore.getState().scene.objects;
        const copyWorld = resolveWorldTransform(after, altCopyId);
        startX = copyWorld.x;
        startY = copyWorld.y;
        // Konva's node still sits at the original's spot — teleport it onto
        // the copy so the first delta is ~0 instead of a -24 jump.
        node.position({ x: copyWorld.x, y: copyWorld.y });
      }
    }
    bodyDragRef.current = {
      startWx: node.x(),
      startWy: node.y(),
      startX,
      startY,
      lastDx: 0,
      lastDy: 0,
      altCopyId,
    };
    beginInteraction();
  };

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    const base = bodyDragRef.current;
    // A node drag that ends over empty canvas still emits a stage click —
    // tell the stage to swallow it so the dragged selection survives the drop.
    onBodyDragMoved?.();
    // Live-sync the store so the selection outline follows during the drag.
    // No extra history is pushed: only the begin snapshot matters. The node
    // position is in WORLD space (the Stage carries the camera); convert it
    // into the object's local frame before storing.
    const node = e.target;
    const dragId = base?.altCopyId ?? obj.id;
    // Gesture-total delta (from dragstart), so Shift-lock never compounds.
    let dx = base ? node.x() - base.startWx : node.x() - world.x;
    let dy = base ? node.y() - base.startWy : node.y() - world.y;
    if ((e.evt as MouseEvent)?.shiftKey) {
      const locked = axisLockDelta(dx, dy);
      dx = locked.x;
      dy = locked.y;
    }
    // Multi-selection move-as-one: dragging any member of a loose multi-
    // selection moves every SELECTION ROOT by the same world delta.
    if (
      selectedObjId !== null &&
      selectedIds.length > 1 &&
      selectedIds.includes(obj.id)
    ) {
      // Incremental residual: moveObjectsBy applies the delta to the store,
      // so only the not-yet-applied slice goes through each event.
      if (base) {
        moveObjectsBy(selectedIds, dx - base.lastDx, dy - base.lastDy);
        base.lastDx = dx;
        base.lastDy = dy;
      } else {
        moveObjectsBy(selectedIds, dx, dy);
      }
      return;
    }
    // CAPCUT DRAG LAW: dragging ANY member of a group moves the WHOLE group.
    // Double-click "enters" a group for solo member editing; while inside,
    // members drag individually again. Alt-duplicate of a member duplicates
    // the member itself (explicit user intent), then drags the copy.
    const rootId = base?.altCopyId ?? groupRootOf(objects, obj.id);
    if (!base?.altCopyId && rootId !== obj.id && soloRoot !== rootId) {
      if (base) {
        // Same residual trick: moveGroup is incremental, our dx/dy is total.
        const rdx = dx - base.lastDx;
        const rdy = dy - base.lastDy;
        if (rdx !== 0 || rdy !== 0) moveGroup(rootId, rdx, rdy);
        base.lastDx = dx;
        base.lastDy = dy;
      } else {
        moveGroup(rootId, dx, dy);
      }
      return;
    }
    const parent = parentWorld ?? { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };
    // Desired world anchor = FROZEN gesture-start store value + locked delta,
    // snapped to 1px. (The live `world` prop moves under us mid-gesture, so
    // adding dx to it would double-count.)
    const wantWx = snapPos((base?.startX ?? world.x) + dx, 1);
    const wantWy = snapPos((base?.startY ?? world.y) + dy, 1);
    const local = worldPointToLocal(parent, wantWx, wantWy);
    updateTransform(dragId, { x: local.x, y: local.y });
  };

  const handleDragEnd = () => {
    bodyDragRef.current = null;
    endInteraction();
  };

  const handleSelect = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    // While drawing (path / freehand / arrow), ignore object clicks so the
    // drawing isn't lost when the cursor crosses another asset.
    const tool = useSceneStore.getState().activeTool;
    if (tool === 'path' || tool === 'freehand' || tool === 'arrow') return;
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

  // Double-click a group MEMBER to enter solo-edit mode for its group:
  // members drag individually until an empty-canvas click exits.
  // During path drawing: place a waypoint on the object instead.
  const handleDblClick = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const tool = useSceneStore.getState().activeTool;
    if (tool === 'path') {
      // Place a waypoint at this object's world position so the commander
      // can draw paths that cross over assets.
      useSceneStore.getState().setPendingPathWaypoint({ x: world.x, y: world.y });
      return;
    }
    const rootId = groupRootOf(objects, obj.id);
    if (rootId !== obj.id) useSoloEditStore.getState().enter(rootId);
  };

  const common = {
    x,
    y,
    rotation,
    scaleX: scale,
    scaleY: scale,
    // Solo-mode cue: while inside this object's group, NON-selected members
    // dim so the commander can see who moves alone. Editor-only — the
    // Remotion render never reads this.
    opacity:
      soloRoot !== null &&
      soloRoot === groupRootOf(objects, obj.id) &&
      selectedObjId !== obj.id
        ? opacity * 0.45
        : opacity,
    draggable: true,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
    onClick: handleSelect,
    onTap: handleSelect,
    onDblClick: handleDblClick,
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
  if (obj.discColor && obj.type === 'unit' && !img) {
    // DISC-ONLY mode (viral battle-map style): solid filled circle.
    const r = 36;
    body = (
      <Ellipse
        radiusX={r}
        radiusY={r}
        fill={obj.discColor}
      />
    );
  } else if (img && asset) {
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
          hitStrokeWidth={ARROW_HIT_WIDTH}
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
          hitStrokeWidth={ARROW_HIT_WIDTH}
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
