import { useEffect, useRef, useState } from 'react';
import type { ObjId } from '../../scene/types';
import { useSceneStore } from '../../scene/store';
import {
  selectObjectUnified,
  selectKeyframeUnified,
  useTimelineSelection,
} from '../selection';

interface KeyframeTrackProps {
  objId: ObjId;
}

const DIAMOND = 12;

export function KeyframeTrack({ objId }: KeyframeTrackProps) {
  // Select the whole map (stable identity under immer); derive per-object list.
  const keyframesMap = useSceneStore((s) => s.scene.keyframes);
  const objects = useSceneStore((s) => s.scene.objects);
  const selectedObjId = useTimelineSelection((s) => s.selectedObjId);
  const selectedKeyframeTime = useTimelineSelection((s) => s.selectedKeyframeTime);
  const duration = useSceneStore((s) => s.scene.timeline.duration);
  const fps = useSceneStore((s) => s.scene.timeline.fps);
  const updateKeyframe = useSceneStore((s) => s.updateKeyframe);

  const keyframes = keyframesMap[objId] ?? [];
  const obj = objects[objId];
  // Human-readable row name: editable name, then commander label, then
  // "type · short-id" (raw UUID-style ids read as gibberish).
  const name = obj
    ? (obj.name ?? obj.label ?? `${obj.type} · ${objId.slice(-4)}`)
    : objId;
  const isActive = selectedObjId === objId;

  const rowRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Selecting a unit on canvas must REVEAL its track, even when the
    // timeline is scrolled or the row was clipped below the fold.
    if (isActive) rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isActive]);

  // Diamond drag: a keyframe's `time` is its identity, so the store is NOT
  // written during the drag (that would remount the diamond and drop pointer
  // capture). Instead we hold the live target in local state, preview it, and
  // commit ONE updateKeyframe on pointerup. `startTime` stays fixed while
  // dragging; `current` is the previewed time.
  const [drag, setDrag] = useState<{ startTime: number; current: number } | null>(null);
  // Time of the occupant keyframe that would be REPLACED if dropped now
  // (collision within half a frame at the current fps — never float equality).
  const [collisionTime, setCollisionTime] = useState<number | null>(null);

  const collide = (target: number): number | null => {
    const tol = fps > 0 ? 0.5 / fps : 0.016;
    const hit = keyframes.find(
      (k) => k.time !== drag?.startTime && Math.abs(k.time - target) < tol
    );
    return hit ? hit.time : null;
  };

  const targetFromPointer = (clientX: number): number => {
    const lane = laneRef.current;
    if (!lane) return 0;
    const rect = lane.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  return (
    <div className="keyframe-track" data-testid={`keyframe-track-${objId}`} ref={rowRef}>
      <button
        type="button"
        className={isActive ? 'track-label active' : 'track-label'}
        data-testid={`track-select-${objId}`}
        onClick={() => selectObjectUnified(objId)}
      >
        {name}
      </button>
      <div
        className={isActive ? 'kf-lane active' : 'kf-lane'}
        data-testid={`kf-lane-${objId}`}
        ref={laneRef}
      >
        {keyframes.map((kf) => {
          // While dragging THIS keyframe, render it at the live target time;
          // every other diamond stays put until the one commit on pointerup.
          const isDragged = drag !== null && kf.time === drag.startTime;
          const leftTime = isDragged ? drag.current : kf.time;
          const leftPct = duration > 0 ? (leftTime / duration) * 100 : 0;
          const isSelected = isActive && selectedKeyframeTime === kf.time;
          // Collision hint: the occupant that a dragged keyframe is about to
          // land on lights up red (boss-approved) — dropping snaps to it, so
          // what the hint warns about is exactly what happens.
          const isCollisionTarget = collisionTime !== null && kf.time === collisionTime;
          // P1 curves: a tiny white dot marks keyframes that carry a bezier
          // control point (icon/badge only — editing happens on canvas).
          const isCurved = kf.cpIn !== undefined || kf.cpOut !== undefined;
          return (
            <div
              key={kf.time}
              role="button"
              tabIndex={0}
              aria-label={`keyframe at ${kf.time}${isCurved ? ' (curved)' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                // Unified: object selected everywhere + keyframe focused.
                selectKeyframeUnified(objId, kf.time);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  selectKeyframeUnified(objId, kf.time);
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // Capture on the diamond: the store is untouched during the
                // drag (key={kf.time} stays stable), so capture survives.
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ startTime: kf.time, current: kf.time });
                setCollisionTime(null);
              }}
              onPointerMove={(e) => {
                if (drag === null || drag.startTime !== kf.time) return;
                const target = targetFromPointer(e.clientX);
                setDrag({ startTime: kf.time, current: target });
                setCollisionTime(collide(target));
              }}
              onPointerUp={(e) => {
                if (drag === null || drag.startTime !== kf.time) return;
                e.currentTarget.releasePointerCapture?.(e.pointerId);
                if (drag.current !== kf.time) {
                  // Snap onto the occupant when the drop lands within the
                  // collision tolerance — the red hint said "will replace",
                  // so a real replace is the truthful outcome.
                  const occupant = collide(drag.current);
                  const target = occupant ?? drag.current;
                  updateKeyframe(objId, kf.time, {
                    time: Math.round(target * 100) / 100,
                  });
                }
                setDrag(null);
                setCollisionTime(null);
              }}
              onPointerCancel={() => {
                setDrag(null);
                setCollisionTime(null);
              }}
              title={`${name} @ ${kf.time}s · drag to move${isCurved ? ' · curved' : ''}`}
              style={{
                position: 'absolute',
                left: `calc(${leftPct}% - ${DIAMOND / 2}px)`,
                top: (24 - DIAMOND) / 2,
                width: DIAMOND,
                height: DIAMOND,
                transform: 'rotate(45deg)',
                background: isSelected
                  ? '#4d8dff'
                  : isCollisionTarget
                    ? '#ff5c5c'
                    : isDragged
                      ? '#9cc3ff'
                      : '#b9c0cc',
                border: isSelected
                  ? '1px solid #bcd7ff'
                  : isCollisionTarget
                    ? '1px solid #ff9c9c'
                    : '1px solid #3a3a42',
                borderRadius: 1,
                cursor: isDragged ? 'grabbing' : 'ew-resize',
                touchAction: 'none',
              }}
            >
              {isCurved && (
                <span
                  data-testid={`curve-badge-${objId}-${kf.time}`}
                  style={{
                    position: 'absolute',
                    inset: '25%',
                    borderRadius: '50%',
                    background: '#ffffff',
                    transform: 'rotate(-45deg)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
