import { useSceneStore } from '../../scene/store';
import { usePlaybackStore } from '../playbackStore';
import { useTimelineSelection } from '../selection';

/**
 * Keyframe editing for the timeline-selected object:
 * add at playhead / stamp current pose / move to playhead / remove.
 */
export function KeyframeEditor() {
  const selectedObjId = useTimelineSelection((s) => s.selectedObjId);
  const selectedKeyframeTime = useTimelineSelection((s) => s.selectedKeyframeTime);
  const objects = useSceneStore((s) => s.scene.objects);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const setKeyframeAtTime = useSceneStore((s) => s.setKeyframeAtTime);
  const updateKeyframe = useSceneStore((s) => s.updateKeyframe);
  const removeKeyframe = useSceneStore((s) => s.removeKeyframe);

  const obj = selectedObjId ? objects[selectedObjId] : undefined;
  const kfTime = selectedKeyframeTime;

  return (
    <div
      className="keyframe-editor"
      data-testid="keyframe-editor"
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
    >
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
