// Camera module (P0 / MVP-1) — public surface.
// Camera state lives in Scene.camera (single source of truth).

// Types from the scene module.
export type { CameraState, Vec2 } from '../scene/types';

// Pure math.
export {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  clampZoom,
  resetCamera,
  worldToScreen,
  screenToWorld,
  panCamera,
  zoomAtPoint,
  cameraToStageProps,
  type Viewport,
  type StageProps,
} from './cameraMath';

// React binding for the canvas.
export { useCamera, type CameraBinding } from './useCamera';

// Interaction helpers (Konva-free).
export {
  DELTA_PIXEL,
  DELTA_LINE,
  DELTA_PAGE,
  LINE_HEIGHT_PX,
  PAGE_HEIGHT_PX,
  normalizeWheelDelta,
  wheelDeltaToFactor,
  clientToStagePoint,
  useCameraPan,
  type CameraPanHandlers,
} from './cameraInteractions';
