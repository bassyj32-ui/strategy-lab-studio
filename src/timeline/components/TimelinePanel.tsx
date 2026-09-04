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
import { AudioTrackRow } from './AudioTrackRow';
import { KeyframeEditor } from './KeyframeEditor';
import { CAMERA_PRESETS, type CameraPresetKind } from '../../camera/presets';
import type { MotionPresetKind } from '../../motion/presets';

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
  const transaction = useSceneStore((s) => s.transaction);
  const applyMotionPreset = useSceneStore((s) => s.applyMotionPreset);
  // Motion-preset destination/duration drafts. Null = fall back to the live
  // camera centre at apply time ("march them to where I'm looking").
  const [destXDraft, setDestXDraft] = useState<string | null>(null);
  const [destYDraft, setDestYDraft] = useState<string | null>(null);
  const [motionDurDraft, setMotionDurDraft] = useState<string | null>(null);
  const [staggerDraft, setStaggerDraft] = useState<string | null>(null);

  /** Run a motion preset on the current selection at the playhead. */
  const runMotionPreset = (kind: MotionPresetKind) => {
    const st = useSceneStore.getState();
    const ids = [
      ...(st.selectedObjId ? [st.selectedObjId] : []),
      ...st.selectedIds,
    ].filter((id, i, arr) => arr.indexOf(id) === i && st.scene.objects[id]);
    if (kind !== 'camera-push' && ids.length === 0) return;
    const cam = st.scene.camera;
    const num = (raw: string | null, fallback: number): number => {
      if (raw === null) return fallback;
      const v = Number(raw);
      return Number.isFinite(v) ? v : fallback;
    };
    const anchor = {
      x: num(destXDraft, cam.x),
      y: num(destYDraft, cam.y),
    };
    const startAt = usePlaybackStore.getState().currentTime;
    const duration = Math.max(0.2, num(motionDurDraft, 3));
    const stagger = Math.max(0, num(staggerDraft, kind === 'volley' ? 0.08 : 0.25));
    applyMotionPreset(kind, { ids, anchor, startAt, duration, stagger });
  };

  /** Fill the destination inputs with the live camera centre. */
  const useViewAsDestination = () => {
    const cam = useSceneStore.getState().scene.camera;
    setDestXDraft(String(Math.round(cam.x)));
    setDestYDraft(String(Math.round(cam.y)));
  };
  const [hintsOpen, setHintsOpen] = useState(false);
  const [durationDraft, setDurationDraft] = useState<string | null>(null);
  const [fpsDraft, setFpsDraft] = useState<string | null>(null);

  const commitDuration = () => {
    if (durationDraft === null) return;
    const raw = Number(durationDraft);
    setDurationDraft(null);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const d = Math.round(raw * 100) / 100;
    if (d !== duration) {
      transaction((scene) => {
        scene.timeline.duration = d;
      });
    }
  };
  const commitFps = () => {
    if (fpsDraft === null) return;
    const raw = Number(fpsDraft);
    setFpsDraft(null);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const f = Math.round(raw);
    if (f !== fps) {
      transaction((scene) => {
        scene.timeline.fps = f;
      });
    }
  };

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
  const audioTracks = useSceneStore((s) => s.scene.audioTracks ?? []);

  return (
    <div className="timeline-panel" data-testid="timeline-panel" onKeyDown={onPanelKeyDown}>
      <div className="timeline-top-row">
        <TransportControls />
        <div className="timeline-settings">
          <label className="timeline-meta" title="Timeline duration in seconds">
            Dur
            <input
              type="number"
              data-testid="timeline-duration"
              min={0.1}
              step={0.1}
              value={durationDraft !== null ? durationDraft : duration}
              onChange={(e) => setDurationDraft(e.target.value)}
              onFocus={() => setDurationDraft(String(duration))}
              onBlur={commitDuration}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
          <label className="timeline-meta" title="Frames per second">
            FPS
            <input
              type="number"
              data-testid="timeline-fps"
              min={1}
              max={60}
              step={1}
              value={fpsDraft !== null ? fpsDraft : fps}
              onChange={(e) => setFpsDraft(e.target.value)}
              onFocus={() => setFpsDraft(String(fps))}
              onBlur={commitFps}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
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
      </div>
      <div className="timeline-presets-row">
        <span className="preset-zone" data-testid="cinematic-zone">
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
        </span>
        <span
          className="motion-presets"
          data-testid="motion-presets"
          title="Motion presets — human-like movement (staggered march, arced charge, arrow volley, soft arrival, camera push). Applies to the selection at the playhead, one undo step; everything stays editable keyframes after."
        >
          <span className="preset-caption">Move</span>
          {(
            [
              ['march', '🚶 March', 'Staggered steady advance to the destination (constant speed, formation kept)'],
              ['charge', '⚔️ Charge', 'Accelerating arc to the destination (bows sideways, no corner kink)'],
              ['volley', '🏹 Volley', 'Arrow storm onto the destination (tight stagger, upward arc, scatter)'],
              ['settle', '🛬 Settle', 'Soften existing tracks: ease-out arrival on the final segment'],
              ['camera-push', '🎥 Push', 'Camera hold-then-push at the playhead (appends, never replaces)'],
            ] as [MotionPresetKind, string, string][]
          ).map(([kind, label, hint]) => (
            <button
              key={kind}
              type="button"
              className="camera-preset motion-btn"
              data-testid={`motion-${kind}`}
              title={`${label} — ${hint}`}
              onClick={() => runMotionPreset(kind)}
            >
              {label}
            </button>
          ))}
          <label className="timeline-meta" title="Destination X (world units). Empty = live camera centre.">
            DX
            <input
              type="number"
              data-testid="motion-dest-x"
              value={destXDraft ?? ''}
              placeholder="view"
              onChange={(e) => setDestXDraft(e.target.value)}
            />
          </label>
          <label className="timeline-meta" title="Destination Y (world units). Empty = live camera centre.">
            DY
            <input
              type="number"
              data-testid="motion-dest-y"
              value={destYDraft ?? ''}
              placeholder="view"
              onChange={(e) => setDestYDraft(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="camera-preset"
            data-testid="motion-use-view"
            title="Fill the destination with the live camera centre"
            onClick={useViewAsDestination}
          >
            ⌖
          </button>
          <label className="timeline-meta" title="Seconds each unit travels (default 3).">
            Sec
            <input
              type="number"
              data-testid="motion-duration"
              min={0.2}
              step={0.1}
              value={motionDurDraft ?? ''}
              placeholder="3"
              onChange={(e) => setMotionDurDraft(e.target.value)}
            />
          </label>
          <label className="timeline-meta" title="Delay between consecutive unit starts (default 0.25, volley 0.08).">
            Stg
            <input
              type="number"
              data-testid="motion-stagger"
              min={0}
              step={0.05}
              value={staggerDraft ?? ''}
              placeholder="0.25"
              onChange={(e) => setStaggerDraft(e.target.value)}
            />
          </label>
        </span>
        <span className="preset-zone" data-testid="fx-zone">
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
        </span>
      </div>
      <Ruler />
      <div className="timeline-tracks" data-testid="timeline-tracks">
        {ids.map((id) => (
          <KeyframeTrack key={id} objId={id} />
        ))}
        <CameraTrack />
        {audioTracks.map((track) => (
          <AudioTrackRow key={track.id} track={track} />
        ))}
        {ids.length === 0 && audioTracks.length === 0 ? (
          <div className="empty-note" data-testid="empty-coaching">
            Place a unit, select it, then Add keyframe at playhead.
          </div>
        ) : null}
      </div>
      {hintsOpen ? (
        <div className="timeline-hints" data-testid="timeline-keyboard-hints">
          <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step frame ·{' '}
          <kbd>Home</kbd> start · <kbd>End</kbd> end · <kbd>K</kbd> keyframe
          selection · <kbd>,</kbd>/<kbd>.</kbd> prev/next keyframe
        </div>
      ) : null}
      <KeyframeEditor />
    </div>
  );
}
