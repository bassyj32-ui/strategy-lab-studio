import React, { useMemo } from 'react';
import { Rect, Line, Text } from 'react-konva';
import type { Scene } from '../scene/types';
import { directChildren } from '../objects/groups';
import { getObjectWorldTransformAtTime } from '../timeline/selectors';
import { useSceneStore } from '../scene/store';

const GROUP_COLOR = '#a78bfa';

interface GroupOverlayProps {
  scene: Scene;
  currentTime: number;
}

/**
 * Pure visual overlay for groups (editor only): dashed AABB + spokes.
 * All nodes are listening=false, non-draggable. Time-correct via
 * getObjectWorldTransformAtTime.
 */
export function GroupOverlay({ scene, currentTime }: GroupOverlayProps) {
  const zoom = useSceneStore((s) => s.scene.camera.zoom);

  const groups = useMemo(() => {
    const objs = scene.objects;
    return Object.values(objs).filter(
      (o) => o.type === 'group' || directChildren(objs, o.id).length > 0
    );
  }, [scene.objects]);

  const k = 1 / Math.max(zoom, 0.0001);
  const padding = 18 * k;
  const strokeWidth = 1.5 * k;
  const dash = [8 * k, 6 * k];
  const spokeWidth = 1 * k;

  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((group) => {
        const children = directChildren(scene.objects, group.id);
        if (children.length === 0) return null;

        const childWorlds = children.map((c) => {
          const wt = getObjectWorldTransformAtTime(scene, c.id, currentTime);
          return { id: c.id, x: wt.x, y: wt.y };
        });

        const groupWorld = getObjectWorldTransformAtTime(scene, group.id, currentTime);

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const cw of childWorlds) {
          if (cw.x < minX) minX = cw.x;
          if (cw.y < minY) minY = cw.y;
          if (cw.x > maxX) maxX = cw.x;
          if (cw.y > maxY) maxY = cw.y;
        }

        const rectX = minX - padding;
        const rectY = minY - padding;
        const rectW = maxX - minX + padding * 2;
        const rectH = maxY - minY + padding * 2;

        return (
          <React.Fragment key={group.id}>
            <Rect
              x={rectX}
              y={rectY}
              width={rectW}
              height={rectH}
              stroke={GROUP_COLOR}
              strokeWidth={strokeWidth}
              dash={dash}
              fillEnabled={false}
              listening={false}
            />
            {childWorlds.map((cw) => (
              <Line
                key={`spoke-${group.id}-${cw.id}`}
                points={[groupWorld.x, groupWorld.y, cw.x, cw.y]}
                stroke={GROUP_COLOR}
                strokeWidth={spokeWidth}
                opacity={0.35}
                listening={false}
              />
            ))}
            <Text
              x={rectX}
              y={rectY - 14 * k}
              text={group.name ?? group.id}
              fontSize={11 * k}
              fill={GROUP_COLOR}
              opacity={0.9}
              listening={false}
            />
          </React.Fragment>
        );
      })}
    </>
  );
}

export default GroupOverlay;
