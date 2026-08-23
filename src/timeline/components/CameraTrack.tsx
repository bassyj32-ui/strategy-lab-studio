import { useRef } from 'react';
import { useSceneStore } from '../../scene/store';
import { usePlaybackStore } from '../playbackStore';

const DIAMOND = 10;

/**
 * The per-scene CAMERA track row: one diamond per camera keyframe, seek on
 * click, drag a diamond to move its time (one undo step, committed on drop),
 * plus key/remove-at-playhead controls. Pure DOM — the battlefield canvas is
 * never rendered here.
 */
export function CameraTrack() {
  const track = useSceneStore((s) => s.scene.cameraTrack);
  const duration = useSceneStore((s) => s.scene.timeline.duration);
  const setCameraKeyframe = useSceneStore((s) => s.setCameraKeyframe);
  const removeCameraKeyframe = useSceneStore((s) => s.removeCameraKeyframe);
  const moveCameraKeyframe = useSceneStore((s) => s.moveCameraKeyframe);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const seek = usePlaybackStore((s) => s.seek);
  const laneRef = useRef<HTMLDivElement | null>(null);

  const sorted = [...(track ?? [])].sort((a, b) => a.time - b.time);
  const hasAtPlayhead = sorted.some(
    (k) => Math.abs(k.time - currentTime) < 1e-6
  );

  /** Horizontal drag position → seconds (same pct math as the ruler). */
  const timeFromPointer = (clientX: number): number | null => {
    const lane = laneRef.current;
    if (!lane || duration <= 0) return null;
    const rect = lane.getBoundingClientRect();
    const pct = (clientX - rect.left) / rect.width;
    return Math.min(duration, Math.max(0, pct * duration));
  };

  if (!sorted.length) return null;

  return (
    <div className="keyframe-track" data-testid="camera-track">
      <span className="track-label" data-testid="camera-track-label">
        Camera
      </span>
      <div className="kf-lane" ref={laneRef}>
        {sorted.map((kf) => {
          const leftPct = duration > 0 ? (kf.time / duration) * 100 : 0;
          return (
            <div
              key={kf.time}
              role="button"
              tabIndex={0}
              aria-label={`camera keyframe at ${kf.time}`}
              title={`Camera @ ${kf.time}s · drag to move`}
              data-testid={`camera-kf-${kf.time}`}
              onClick={(e) => {
                e.stopPropagation();
                seek(kf.time);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') seek(kf.time);
              }}
              style={{
                position: 'absolute',
                left: `calc(${leftPct}% - ${DIAMOND / 2}px)`,
                top: (24 - DIAMOND) / 2,
                width: DIAMOND,
                height: DIAMOND,
                transform: 'rotate(45deg)',
                background: '#7dd3fc',
                border: '1px solid #e0f2fe',
                borderRadius: 1,
                cursor: 'grab',
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                const fromTime = kf.time;
                let latest = fromTime;
                const onMove = (ev: PointerEvent): void => {
                  const t = timeFromPointer(ev.clientX);
                  if (t !== null) latest = t;
                };
                const onUp = (): void => {
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  // ONE undo step for the whole gesture.
                  if (Math.abs(latest - fromTime) > 1e-6)
                    moveCameraKeyframe(fromTime, latest);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
              }}
            />
          );
        })}
      </div>
      <button
        type="button"
        data-testid="camera-key-at-playhead"
        onClick={() => setCameraKeyframe(currentTime)}
        title="Store the current view as a camera keyframe at the playhead"
      >
        Key cam @ playhead
      </button>
      <button
        type="button"
        data-testid="camera-remove-at-playhead"
        disabled={!hasAtPlayhead}
        onClick={() => removeCameraKeyframe(currentTime)}
        title="Remove the camera keyframe at the playhead"
      >
        ✕
      </button>
    </div>
  );
}
