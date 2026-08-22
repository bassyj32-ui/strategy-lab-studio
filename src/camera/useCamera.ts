// React binding for the camera. This is the contract the canvas will use:
// read the camera from the scene store (single source of truth) and expose
// ready-to-spread Konva <Stage> props plus pan/zoom committers.
//
// Framework-light on purpose: only react + the store + cameraMath.
// It does NOT import react-konva — the canvas spreads `stageProps` onto <Stage>.

import { useSceneStore } from '../scene/store';
import type { CameraState } from '../scene/types';
import {
  cameraToStageProps,
  panCamera,
  zoomAtPoint,
  type Viewport,
  type StageProps,
} from './cameraMath';

export interface CameraBinding {
  /** Props to spread onto a Konva <Stage> (x, y, scaleX, scaleY, rotation). */
  stageProps: StageProps;
  /** Pan the view by (dxScreen, dyScreen) pixels in screen space. */
  panBy: (dxScreen: number, dyScreen: number) => void;
  /** Zoom by `factor`, anchored at `screenPoint` (pixels, viewport space). */
  zoomAt: (factor: number, screenPoint: { x: number; y: number }) => void;
}

export function useCamera(vp: Viewport): CameraBinding {
  // Read camera from the store (re-renders when it changes).
  const camera = useSceneStore((s) => s.scene.camera);
  const updateCamera = useSceneStore((s) => s.updateCamera);

  const stageProps = cameraToStageProps(camera, vp);

  const panBy = (dxScreen: number, dyScreen: number): void => {
    updateCamera((cam: CameraState) => panCamera(cam, dxScreen, dyScreen));
  };

  const zoomAt = (
    factor: number,
    screenPoint: { x: number; y: number },
  ): void => {
    updateCamera((cam: CameraState) =>
      zoomAtPoint(cam, vp, factor, screenPoint),
    );
  };

  return { stageProps, panBy, zoomAt };
}
