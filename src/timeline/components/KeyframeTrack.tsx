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

const DIAMOND = 10;

/** One row per object: keyframe diamonds at their times. Click selects. */
export function KeyframeTrack({ objId }: KeyframeTrackProps) {
  // Select the whole map (stable identity under immer); derive per-object list.
  const keyframesMap = useSceneStore((s) => s.scene.keyframes);
  const objects = useSceneStore((s) => s.scene.objects);
  const selectedObjId = useTimelineSelection((s) => s.selectedObjId);
  const selectedKeyframeTime = useTimelineSelection((s) => s.selectedKeyframeTime);

  const keyframes = keyframesMap[objId] ?? [];
  const name = objects[objId]?.id ?? objId;
  const isActive = selectedObjId === objId;
  const duration = useSceneStore((s) => s.scene.timeline.duration);

  return (
    <div className="keyframe-track" data-testid={`keyframe-track-${objId}`}>
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
          return (
            <div
              key={kf.time}
              role="button"
              tabIndex={0}
              aria-label={`keyframe at ${kf.time}`}
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
              title={`${name} @ ${kf.time}s`}
              style={{
                position: 'absolute',
                left: `calc(${leftPct}% - ${DIAMOND / 2}px)`,
                top: (24 - DIAMOND) / 2,
                width: DIAMOND,
                height: DIAMOND,
                transform: 'rotate(45deg)',
                background: isSelected ? '#f5a83c' : '#5c6f8f',
                border: isSelected ? '1px solid #ffe3b3' : 'none',
                borderRadius: 1,
                cursor: 'pointer',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
