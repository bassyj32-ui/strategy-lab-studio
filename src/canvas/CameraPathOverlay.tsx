import { useMemo } from 'react';
import { Line, Circle } from 'react-konva';
import type { Scene } from '../scene/types';
import { getCameraAtTime, hasCameraTrack } from '../timeline/cameraTrack';

/**
 * Editor-only visualization of the animated camera's trajectory (PRD §87):
 * a dashed polyline sampled from the ONE canonical camera interpolator plus
 * a brighter dot at the CURRENT keyed camera centre while scrubbing.
 * Pure derived read — nothing here is serialized, rendered by Remotion
 * (draw.ts never draws it), or interactive.
 */

/** Uniformly sample the camera track's x/y trajectory in world space. */
export function sampleCameraPath(
  scene: Scene,
  samples = 64
): Array<{ x: number; y: number }> {
  const track = scene.cameraTrack ?? [];
  if (track.length === 0) return [];
  const sorted = [...track].sort((a, b) => a.time - b.time);
  const from = sorted[0].time;
  const to = sorted[sorted.length - 1].time;
  const pts: Array<{ x: number; y: number }> = [];
  const n = Math.max(2, samples);
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    const cam = getCameraAtTime(scene, t);
    pts.push({ x: cam.x, y: cam.y });
  }
  return pts;
}

export function CameraPathOverlay({
  scene,
  currentTime,
}: {
  scene: Scene;
  currentTime: number;
}) {
  const points = useMemo(() => sampleCameraPath(scene), [scene]);
  const flat = useMemo(() => {
    const out: number[] = [];
    for (const p of points) out.push(p.x, p.y);
    return out;
  }, [points]);

  if (!hasCameraTrack(scene) || points.length < 2) return null;

  const now = getCameraAtTime(scene, currentTime);

  return (
    <>
      <Line
        points={flat}
        stroke="#4d8dff"
        strokeWidth={2}
        opacity={0.55}
        dash={[8, 8]}
        lineCap="round"
        listening={false}
      />
      {/* Where the keyed camera sits right now. */}
      <Circle
        x={now.x}
        y={now.y}
        radius={7}
        fill="#4d8dff"
        stroke="#bcd7ff"
        strokeWidth={1.5}
        opacity={0.9}
        listening={false}
      />
    </>
  );
}
