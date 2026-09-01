import { useMemo } from 'react';
import { Ellipse, Line } from 'react-konva';
import type { Scene } from '../scene/types';
import { directChildren, formationOffsets } from '../objects/groups';
import { getObjectWorldTransformAtTime } from '../timeline/selectors';
import { useSceneStore } from '../scene/store';

const GUIDE_COLOR = '#4fd1c5';
const GHOST_COLOR = '#facc15';

interface ShapeGuideOverlayProps {
  scene: Scene;
  currentTime: number;
}

/**
 * Shapes-panel guide (NEW, replaces AI-era overlays): for the currently
 * targeted shape GROUP, draw a curved baseline of its formation and ghost
 * markers at every future unit slot (existing children shown faint, the NEXT
 * slot glowing). Pure visual — listening=false, non-interactive. Time-correct
 * via getObjectWorldTransformAtTime so the group can be animated.
 */
export function ShapeGuideOverlay({ scene, currentTime }: ShapeGuideOverlayProps) {
  const zoom = useSceneStore((s) => s.scene.camera.zoom);
  const shapeTargetId = useSceneStore((s) => s.shapeTargetId);

  const group = shapeTargetId ? scene.objects[shapeTargetId] : undefined;
  const formation = group && group.type === 'group' ? group.formation : undefined;

  const k = 1 / Math.max(zoom, 0.0001);
  const guideWidth = 1.5 * k;
  const dash = [7 * k, 5 * k];
  const ghostRadius = 9 * k;

  const slots = useMemo(() => {
    if (!group || !formation) return null;
    const existing = directChildren(scene.objects, group.id);
    const have = existing.length;
    const next = have + 1;
    return {
      have,
      offs: formationOffsets(formation.pattern, next, formation.spacing, {
        radius: formation.radius,
        orientation: formation.orientation,
      }),
    };
  }, [group, formation, scene.objects]);

  if (!group || !formation || !slots || slots.offs.length === 0) return null;

  const groupWorld = getObjectWorldTransformAtTime(scene, group.id, currentTime);

  // Guide line through each predicted slot's world position.
  const guidePoints: number[] = [];
  for (const off of slots.offs) {
    guidePoints.push(groupWorld.x + off.x, groupWorld.y + off.y);
  }

  return (
    <>
      {guidePoints.length >= 4 && (
        <Line
          points={guidePoints}
          stroke={GUIDE_COLOR}
          strokeWidth={guideWidth}
          dash={dash}
          opacity={0.5}
          listening={false}
        />
      )}
      {slots.offs.map((off, i) => {
        const x = groupWorld.x + off.x;
        const y = groupWorld.y + off.y;
        // i < have = already-placed child (faint); i === have = next slot (glow).
        const next = i === slots.have;
        return (
          <Ellipse
            key={`ghost-${group.id}-${i}`}
            x={x}
            y={y}
            radiusX={ghostRadius}
            radiusY={ghostRadius}
            fill={next ? GHOST_COLOR : undefined}
            stroke={GHOST_COLOR}
            strokeWidth={guideWidth}
            dash={next ? undefined : dash}
            opacity={next ? 0.95 : 0.4}
            listening={false}
          />
        );
      })}
    </>
  );
}

export default ShapeGuideOverlay;
