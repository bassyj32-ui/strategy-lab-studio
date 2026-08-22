import type { ObjId } from '../../scene/types';
import { useSceneStore } from '../../scene/store';
import { useTimelineSelection } from '../selection';

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
  const selectObject = useTimelineSelection((s) => s.selectObject);
  const selectKeyframe = useTimelineSelection((s) => s.selectKeyframe);

  const keyframes = keyframesMap[objId] ?? [];
  const name = objects[objId]?.id ?? objId;
  const isActive = selectedObjId === objId;
  const duration = useSceneStore((s) => s.scene.timeline.duration);

  return (
    <div className="keyframe-track" data-testid={`keyframe-track-${objId}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          selectObject(objId);
          selectKeyframe(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            selectObject(objId);
            selectKeyframe(null);
          }
        }}
        style={{
          width: 120,
          fontSize: 12,
          color: isActive ? '#fff' : '#9aa3b2',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          padding: '2px 4px',
        }}
      >
        {name}
      </div>
      <div
        style={{
          position: 'relative',
          flex: 1,
          height: 24,
          background: isActive ? '#232936' : '#1a1e26',
        }}
      >
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
                selectObject(objId);
                selectKeyframe(kf.time);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') selectKeyframe(kf.time);
              }}
              title={`${name} @ ${kf.time}s`}
              style={{
                position: 'absolute',
                left: `calc(${leftPct}% - ${DIAMOND / 2}px)`,
                top: (24 - DIAMOND) / 2,
                width: DIAMOND,
                height: DIAMOND,
                transform: 'rotate(45deg)',
                background: isSelected ? '#ffd166' : '#7f8ea3',
                border: isSelected ? '1px solid #fff' : 'none',
                cursor: 'pointer',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
