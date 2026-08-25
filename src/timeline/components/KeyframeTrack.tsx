import { useEffect, useRef } from 'react';
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

  const keyframes = keyframesMap[objId] ?? [];
  const obj = objects[objId];
  // Human-readable row name: editable name, then commander label, then
  // "type · short-id" (raw UUID-style ids read as gibberish).
  const name = obj
    ? (obj.name ?? obj.label ?? `${obj.type} · ${objId.slice(-4)}`)
    : objId;
  const isActive = selectedObjId === objId;
  const duration = useSceneStore((s) => s.scene.timeline.duration);

  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Selecting a unit on canvas must REVEAL its track, even when the
    // timeline is scrolled or the row was clipped below the fold.
    if (isActive) rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isActive]);

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
      <div className={isActive ? 'kf-lane active' : 'kf-lane'}>
        {keyframes.map((kf) => {
          const leftPct = duration > 0 ? (kf.time / duration) * 100 : 0;
          const isSelected = isActive && selectedKeyframeTime === kf.time;
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
              title={`${name} @ ${kf.time}s${isCurved ? ' · curved' : ''}`}
              style={{
                position: 'absolute',
                left: `calc(${leftPct}% - ${DIAMOND / 2}px)`,
                top: (24 - DIAMOND) / 2,
                width: DIAMOND,
                height: DIAMOND,
                transform: 'rotate(45deg)',
                background: isSelected ? '#4d8dff' : '#b9c0cc',
                border: isSelected
                  ? '1px solid #bcd7ff'
                  : '1px solid #3a3a42',
                borderRadius: 1,
                cursor: 'pointer',
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
