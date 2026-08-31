import { useMemo } from 'react';
import { Line, Circle } from 'react-konva';
import { useSceneStore } from '../scene/store';
import { composeTransform, worldPointToLocal } from '../objects/groups';
import type { SceneObject, Transform } from '../scene/types';

const WAYPOINT_COLOR = '#4d8dff';
const HANDLE_RADIUS_SCREEN = 7;

const IDENTITY: Transform = {
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  opacity: 1,
};

/**
 * Persistent waypoint polyline + draggable handles for the SELECTED object.
 * Reads scene.keyframes[obj.id] sorted by time and renders a non-interactive
 * polyline through all keyframe positions (world via parentWorld) plus one
 * draggable Circle per keyframe that writes via updateKeyframe.
 */
export function WaypointHandles({
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
  const setKeyframeTransform = useSceneStore((s) => s.setKeyframeTransform);

  const sorted = useMemo(
    () => [...(keyframesMap[obj.id] ?? [])].sort((a, b) => a.time - b.time),
    [keyframesMap, obj.id]
  );

  const r = HANDLE_RADIUS_SCREEN / Math.max(zoom, 0.0001);
  const strokeW = 2 / Math.max(zoom, 0.0001);

  if (sorted.length < 2) return null;

  const toWorld = (p: { x: number; y: number }): { x: number; y: number } => {
    const w = composeTransform(parentWorld ?? IDENTITY, {
      x: p.x,
      y: p.y,
      rotation: 0,
      scale: 1,
      opacity: 1,
    });
    return { x: w.x, y: w.y };
  };

  const flatPoints: number[] = [];
  for (const kf of sorted) {
    const w = toWorld(kf.transform);
    flatPoints.push(w.x, w.y);
  }

  return (
    <>
      <Line
        points={flatPoints}
        stroke={WAYPOINT_COLOR}
        strokeWidth={strokeW}
        opacity={0.85}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      {sorted.map((kf) => {
        const w = toWorld(kf.transform);
        return (
          <Circle
            key={`${obj.id}-${kf.time}`}
            x={w.x}
            y={w.y}
            radius={r}
            fill={WAYPOINT_COLOR}
            stroke="#ffffff"
            strokeWidth={1.5 / Math.max(zoom, 0.0001)}
            opacity={0.95}
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
              const local = worldPointToLocal(parentWorld ?? IDENTITY, pos.x, pos.y);
              setKeyframeTransform(obj.id, kf.time, { x: local.x, y: local.y });
            }}
            onDragEnd={() => endInteraction()}
          />
        );
      })}
    </>
  );
}

export default WaypointHandles;
