import { useEffect } from 'react';
import { useSceneStore } from '../../scene/store';
import { usePlaybackStore } from '../playbackStore';
import { usePlaybackEngine } from '../usePlaybackEngine';
import { TransportControls } from './TransportControls';
import { Ruler } from './Ruler';
import { KeyframeTrack } from './KeyframeTrack';
import { KeyframeEditor } from './KeyframeEditor';

/**
 * Timeline container (React DOM — never the battlefield itself):
 * transport controls, ruler/playhead, one track per object, keyframe editor.
 * Keeps the transient playback bounds in sync with the scene timeline.
 */
export function TimelinePanel() {
  const objects = useSceneStore((s) => s.scene.objects);
  const duration = useSceneStore((s) => s.scene.timeline.duration);
  const fps = useSceneStore((s) => s.scene.timeline.fps);
  const syncTimeline = usePlaybackStore((s) => s.syncTimeline);

  useEffect(() => {
    syncTimeline(duration, fps);
  }, [duration, fps, syncTimeline]);

  usePlaybackEngine();

  const ids = Object.keys(objects);

  return (
    <div
      className="timeline-panel"
      data-testid="timeline-panel"
      style={{
        borderTop: '1px solid #444',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <TransportControls />
      <Ruler />
      {ids.map((id) => (
        <KeyframeTrack key={id} objId={id} />
      ))}
      {ids.length === 0 ? (
        <div style={{ color: '#777', fontSize: 12 }}>No objects yet.</div>
      ) : null}
      <KeyframeEditor />
    </div>
  );
}
