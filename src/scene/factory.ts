import type { Scene, Timeline, WorldSize, LayerId } from './types';
import { defaultTransform } from './transform';

export const DEFAULT_WORLD: WorldSize = { w: 1920, h: 1080 };

export const DEFAULT_TIMELINE: Timeline = { duration: 10, fps: 30 };

export const DEFAULT_LAYER_ID: LayerId = 'layer-root';

/** Neutral starting transform: at the origin, unrotated, unit-scaled, opaque. */
export const DEFAULT_TRANSFORM = defaultTransform();

export function createDefaultScene(id = 'scene-0'): Scene {
  return {
    id,
    name: 'Untitled Battle',
    worldSize: { ...DEFAULT_WORLD },
    assets: {},
    objects: {},
    layers: [
      {
        id: DEFAULT_LAYER_ID,
        name: 'Default',
        visible: true,
        order: 0,
      },
    ],
    keyframes: {},
    // Default view centres the WORLD (positive quadrant) in the viewport —
    // cam.{x,y} is the world point shown at viewport centre (cameraMath §1),
    // so {0,0} would push the whole map off to the bottom-right.
    camera: { x: DEFAULT_WORLD.w / 2, y: DEFAULT_WORLD.h / 2, zoom: 1 },
    timeline: { ...DEFAULT_TIMELINE },
  };
}
