import { Fragment, type ReactNode } from 'react';
import { Circle } from 'react-konva';
import type { Scene } from '../scene/types';
import {
  effectBurst,
  effectColor,
  INSTANCE_BASE_RADIUS,
  instanceActive,
} from '../objects/effects';

/**
 * BATTLE FX editor preview door. Renders the SAME deterministic burst rings
 * as draw.ts (Remotion export) for every active EffectInstance in
 * `scene.effects` — one source of truth, identical visuals in both doors
 * (architecture Law 1). Purely visual: listening=false, never a drop target.
 */
export function EffectOverlay({
  scene,
  time,
}: {
  scene: Scene;
  time: number;
}): ReactNode | null {
  if (!scene.effects) return null;
  const instances = Object.values(scene.effects).filter((inst) =>
    instanceActive(time, inst.startTime, inst.duration)
  );
  if (instances.length === 0) return null;
  return (
    <Fragment>
      {instances.map((inst) =>
        effectBurst(inst.kind, time - inst.startTime, inst.duration).map(
          (ring, i) => (
            <Circle
              key={`${inst.id}-${i}`}
              x={inst.x}
              y={inst.y}
              radius={INSTANCE_BASE_RADIUS * ring.radiusFactor}
              fill={effectColor(inst.kind)}
              opacity={ring.alpha}
              listening={false}
            />
          )
        )
      )}
    </Fragment>
  );
}
