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
    camera: { x: 0, y: 0, zoom: 1 },
    timeline: { ...DEFAULT_TIMELINE },
  };
}
