import { useState } from 'react';
import { useSceneStore } from '../../scene/store';
import { usePlaybackStore } from '../playbackStore';
import { useTimelineSelection } from '../selection';
import type { Easing } from '../../scene/types';

const EASING_OPTIONS: { value: Easing; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeIn', label: 'Ease In' },
  { value: 'easeOut', label: 'Ease Out' },
  { value: 'easeInOut', label: 'Ease In-Out' },
  { value: 'hold', label: 'Hold' },
];

/**
 * Keyframe editing for the timeline-selected object:
 * add at playhead / stamp current pose / move to playhead / set easing /
 * remove. Easing (PRD §112 P0 "basic easing") governs the segment STARTING
 * at the selected keyframe.
 */
export function KeyframeEditor() {
  const selectedObjId = useTimelineSelection((s) => s.selectedObjId);
  const selectedKeyframeTime = useTimelineSelection((s) => s.selectedKeyframeTime);
  const objects = useSceneStore((s) => s.scene.objects);
  const keyframes = useSceneStore((s) => s.scene.keyframes);
  const duration = useSceneStore((s) => s.scene.timeline.duration);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const setKeyframeAtTime = useSceneStore((s) => s.setKeyframeAtTime);
  const updateKeyframe = useSceneStore((s) => s.updateKeyframe);
  const removeKeyframe = useSceneStore((s) => s.removeKeyframe);

  const obj = selectedObjId ? objects[selectedObjId] : undefined;
  const kfTime = selectedKeyframeTime;
  const selectedKf =
    obj && kfTime !== null
      ? keyframes[obj.id]?.find((k) => k.time === kfTime)
      : undefined;

  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const commitTime = () => {
    if (timeDraft === null || !obj || kfTime === null) {
      setTimeDraft(null);
      return;
    }
    const raw = Number(timeDraft);
    setTimeDraft(null);
    if (!Number.isFinite(raw)) return;
    const t = Math.min(duration, Math.max(0, raw));
    if (t !== kfTime) updateKeyframe(obj.id, kfTime, { time: t });
  };

  return (
    <div className="keyframe-editor" data-testid="keyframe-editor">
      <button
        type="button"
        disabled={!obj}
        onClick={() => {
          if (obj) setKeyframeAtTime(obj.id, currentTime);
        }}
      >
        Add keyframe at playhead
      </button>
      <button
        type="button"
        disabled={!obj || kfTime === null}
        onClick={() => {
          if (obj && kfTime !== null) {
            updateKeyframe(obj.id, kfTime, { transform: { ...obj.transform } });
          }
        }}
      >
        Update to current pose
      </button>
      <button
        type="button"
        disabled={!obj || kfTime === null || currentTime === kfTime}
        onClick={() => {
          if (obj && kfTime !== null) updateKeyframe(obj.id, kfTime, { time: currentTime });
        }}
      >
        Move to playhead
      </button>
      <label className="kf-easing">
        Time
        <input
          type="number"
          data-testid="kf-time-edit"
          disabled={!selectedKf}
          min={0}
          max={duration}
          step={duration > 0 ? duration / 100 : 0.01}
          value={timeDraft !== null ? timeDraft : selectedKf?.time.toFixed(2) ?? ''}
          onFocus={() => setTimeDraft(selectedKf?.time.toFixed(2) ?? '')}
          onChange={(e) => setTimeDraft(e.target.value)}
          onBlur={commitTime}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          title="Edit keyframe time (moves this keyframe; replaces any occupant at that time)"
        />
      </label>
      <label className="kf-easing">
        Easing
        <select
          data-testid="kf-easing"
          disabled={!selectedKf}
          value={selectedKf?.easing ?? 'linear'}
          onChange={(e) => {
            if (obj && kfTime !== null) {
              updateKeyframe(obj.id, kfTime, {
                easing: e.target.value as Easing,
              });
            }
          }}
        >
          {EASING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!obj || kfTime === null}
        onClick={() => {
          if (obj && kfTime !== null) removeKeyframe(obj.id, kfTime);
        }}
      >
        Remove selected keyframe
      </button>
    </div>
  );
}
