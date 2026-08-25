import { useEffect, useState } from 'react';
import type {
  ChangeEvent as ReactChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useSceneStore } from '../../scene/store';
import { usePlaybackStore } from '../playbackStore';
import { usePlaybackEngine } from '../usePlaybackEngine';
import { TransportControls } from './TransportControls';
import { Ruler } from './Ruler';
import { KeyframeTrack } from './KeyframeTrack';
import { CameraTrack } from './CameraTrack';
import { KeyframeEditor } from './KeyframeEditor';
import { CAMERA_PRESETS, type CameraPresetKind } from '../../camera/presets';

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
  const applyCameraPreset = useSceneStore((s) => s.applyCameraPreset);
  const triggerDecisiveMove = useSceneStore((s) => s.triggerDecisiveMove);
  const triggerWhyItWorked = useSceneStore((s) => s.triggerWhyItWorked);
  const vignette = useSceneStore((s) => s.scene.vignette);
  const setVignette = useSceneStore((s) => s.setVignette);
  const hasOpeningCard = useSceneStore((s) => Boolean(s.scene.openingCard));
  const hasClosingCard = useSceneStore((s) => Boolean(s.scene.closingCard));
  const triggerSignatureOpening = useSceneStore((s) => s.triggerSignatureOpening);
  const toggleClosingCard = useSceneStore((s) => s.toggleClosingCard);
  const autoKeyframe = useSceneStore((s) => s.autoKeyframe);
  const setAutoKeyframe = useSceneStore((s) => s.setAutoKeyframe);
  const [hintsOpen, setHintsOpen] = useState(false);

  /** Apply a §27 preset; Commander Focus targets the selected object. */
  const onPresetChange = (e: ReactChangeEvent<HTMLSelectElement>) => {
    const kind = e.target.value as CameraPresetKind | '';
    e.target.value = ''; // reset so the same preset can be re-applied
    if (!kind) return;
    const sel = useSceneStore.getState();
    const obj = sel.selectedObjId
      ? sel.scene.objects[sel.selectedObjId]
      : undefined;
    applyCameraPreset(
      kind,
      obj ? { x: obj.transform.x, y: obj.transform.y } : undefined
    );
  };

  useEffect(() => {
    syncTimeline(duration, fps);
  }, [duration, fps, syncTimeline]);

  usePlaybackEngine();

  const ids = Object.keys(objects);

  return (
    <div className="timeline-panel" data-testid="timeline-panel" onKeyDown={onPanelKeyDown}>
      <div className="timeline-top-row">
        <TransportControls />
        <select
          className="camera-preset"
          data-testid="camera-preset"
          value=""
          title="Camera presets (§27) — applied to the camera track, fully editable after"
          onChange={onPresetChange}
        >
          <option value="" disabled>
            Camera preset…
          </option>
          {CAMERA_PRESETS.map((p) => (
            <option key={p.kind} value={p.kind}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="camera-preset"
          data-testid="decisive-move"
          title='Decisive Move (§38) — zoom onto the selection with highlight + tactical arrow, one undo step'
          onClick={() => {
            const sel = useSceneStore.getState();
            const obj = sel.selectedObjId
              ? sel.scene.objects[sel.selectedObjId]
              : undefined;
            triggerDecisiveMove(
              obj ? { focus: { x: obj.transform.x, y: obj.transform.y } } : {}
            );
          }}
        >
          ⚡ Decisive Move
        </button>
        <button
          type="button"
          className="camera-preset"
          data-testid="why-it-worked"
          title={'Why It Worked (§39) — calm zoom-out to overview; pulses the selected object’s faction, one undo step'}
          onClick={() => {
            const sel = useSceneStore.getState();
            const obj = sel.selectedObjId
              ? sel.scene.objects[sel.selectedObjId]
              : undefined;
            triggerWhyItWorked(obj?.faction ? { faction: obj.faction } : {});
          }}
        >
          🧠 Why It Worked
        </button>
        <button
          type="button"
          className="camera-preset"
          data-testid="signature-opening"
          title="Signature Opening (§95) — title card over a hold-wide camera move, one undo step"
          onClick={() => triggerSignatureOpening()}
        >
          📜 Opening Card{hasOpeningCard ? ' ✓' : ''}
        </button>
        <label
          className="vignette-toggle"
          data-testid="closing-card-toggle"
          title="Signature Ending (§96) — 'THE LESSON' card over the final seconds"
        >
          <input
            type="checkbox"
            checked={hasClosingCard}
            onChange={(e) => toggleClosingCard(e.target.checked)}
          />
          Lesson End
        </label>
        <label
          className="vignette-toggle"
          data-testid="vignette-toggle"
          title="Cinematic edge-darkening (§38)"
        >
          <input
            type="checkbox"
            checked={Boolean(vignette)}
            onChange={(e) => setVignette(e.target.checked)}
          />
          Vignette
        </label>
        <label
          className="vignette-toggle"
          data-testid="auto-keyframe-toggle"
          title="Auto-keyframe: moving/scaling/rotating a unit writes a keyframe at the playhead (part of the same undo step as the move)"
        >
          <input
            type="checkbox"
            checked={autoKeyframe}
            onChange={(e) => setAutoKeyframe(e.target.checked)}
          />
          Auto-KF
        </label>
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
      <div className="timeline-tracks" data-testid="timeline-tracks">
        {ids.map((id) => (
          <KeyframeTrack key={id} objId={id} />
        ))}
        <CameraTrack />
        {ids.length === 0 ? (
          <div className="empty-note" data-testid="empty-coaching">
            Place a unit, select it, then Add keyframe at playhead.
          </div>
        ) : null}
      </div>
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
