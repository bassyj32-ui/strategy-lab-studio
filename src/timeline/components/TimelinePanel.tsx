import { useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSceneStore } from '../../scene/store';
import { usePlaybackStore } from '../playbackStore';
import { usePlaybackEngine } from '../usePlaybackEngine';
import { TransportControls } from './TransportControls';
import { Ruler } from './Ruler';
import { KeyframeTrack } from './KeyframeTrack';
import { CameraTrack } from './CameraTrack';
import { KeyframeEditor } from './KeyframeEditor';

/**
 * True when the keydown target is an element that owns its own keys
 * (typing fields, native controls, buttons). We never hijack those —
 * e.g. Space must activate a focused button, not toggle playback.
 */
function targetOwnsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target.isContentEditable
  );
}

/**
 * Panel-scoped keyboard transport: Space play/pause, ←/→ step one frame,
 * Home/End jump to bounds. Active only while focus is somewhere INSIDE this
 * panel (the handler lives on the container), so typing elsewhere is safe.
 * Descendants that already handled a key (the ruler slider calls
 * preventDefault) are respected via the defaultPrevented guard — no double
 * stepping. State is read fresh via getState() so the panel does not need to
 * subscribe to currentTime (keeps re-renders off the hot playback path).
 */
function onPanelKeyDown(e: ReactKeyboardEvent<HTMLDivElement>): void {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (targetOwnsKeys(e.target)) return;

  const store = usePlaybackStore.getState();
  switch (e.key) {
    case ' ': // Space
      e.preventDefault(); // also stops page scroll / button re-activation
      store.toggle();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      store.stepFrames(-1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      store.stepFrames(1);
      break;
    case 'Home':
      e.preventDefault();
      store.seekStart();
      break;
    case 'End':
      e.preventDefault();
      store.seekEnd();
      break;
    default:
      break;
  }
}

/**
 * Timeline container (React DOM — never the battlefield itself):
 * transport + ruler share ONE row (CapCut-style), one track per object,
 * keyframe editor, collapsible keyboard hints, and first-run coaching when
 * the scene is empty.
 * Keeps the transient playback bounds in sync with the scene timeline.
 */
export function TimelinePanel() {
  const objects = useSceneStore((s) => s.scene.objects);
  const duration = useSceneStore((s) => s.scene.timeline.duration);
  const fps = useSceneStore((s) => s.scene.timeline.fps);
  const syncTimeline = usePlaybackStore((s) => s.syncTimeline);
  const [hintsOpen, setHintsOpen] = useState(false);

  useEffect(() => {
    syncTimeline(duration, fps);
  }, [duration, fps, syncTimeline]);

  usePlaybackEngine();

  const ids = Object.keys(objects);

  return (
    <div className="timeline-panel" data-testid="timeline-panel" onKeyDown={onPanelKeyDown}>
      <div className="timeline-top-row">
        <TransportControls />
        <button
          type="button"
          className="hints-toggle"
          data-testid="hints-toggle"
          title="Keyboard shortcuts"
          aria-expanded={hintsOpen}
          onClick={() => setHintsOpen((v) => !v)}
        >
          ?
        </button>
      </div>
      <Ruler />
      {ids.map((id) => (
        <KeyframeTrack key={id} objId={id} />
      ))}
      <CameraTrack />
      {ids.length === 0 ? (
        <div className="empty-note" data-testid="empty-coaching">
          Place a unit, select it, then Add keyframe at playhead.
        </div>
      ) : null}
      {hintsOpen ? (
        <div className="timeline-hints" data-testid="timeline-keyboard-hints">
          <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step frame ·{' '}
          <kbd>Home</kbd> start · <kbd>End</kbd> end
        </div>
      ) : null}
      <KeyframeEditor />
    </div>
  );
}
