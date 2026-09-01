import { Rect } from 'react-konva';
import { useSceneStore } from '../scene/store';
import type { WorldRect } from './marquee';

const MARQUEE_COLOR = '#4fd1c5';

interface MarqueeOverlayProps {
  rect: WorldRect;
}

/**
 * Rubber-band box-select preview (editor only). Dashed rect in world
 * coordinates, zoom-corrected stroke matching the group/guide overlays.
 * listening=false — the actual hit-testing happens in CanvasStage on mouseup.
 */
export function MarqueeOverlay({ rect }: MarqueeOverlayProps) {
  const zoom = useSceneStore((s) => s.scene.camera.zoom);

  const k = 1 / Math.max(zoom, 0.0001);
  const strokeWidth = 1.5 * k;
  const dash = [8 * k, 6 * k];

  return (
    <Rect
      x={rect.minX}
      y={rect.minY}
      width={rect.maxX - rect.minX}
      height={rect.maxY - rect.minY}
      stroke={MARQUEE_COLOR}
      strokeWidth={strokeWidth}
      dash={dash}
      fill="rgba(79, 209, 197, 0.08)"
      listening={false}
    />
  );
}

export default MarqueeOverlay;