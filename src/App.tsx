import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { CanvasStage } from './canvas/CanvasStage';
import { CanvasActionBar } from './ui/CanvasActionBar';
import { AssetsPanel } from './ui/AssetsPanel';
import { ScenesPanel } from './ui/ScenesPanel';
import { RightPanel } from './ui/RightPanel';
import { PreviewPanel } from './ui/PreviewPanel';
import { TimelinePanel } from './timeline';
import { TransportControls } from './timeline/components/TransportControls';
import { useSceneStore } from './scene/store';
import { usePlaybackStore } from './timeline/playbackStore';
import { createDefaultScene } from './scene/factory';
import { saveAutosave, loadAutosave, clearAutosave, debounce } from './persistence/autosave';
import { SessionToast } from './ui/SessionToast';
import { AutoKfToast } from './ui/AutoKfToast';
import { handleEditorShortcut, isTypingTarget } from './ui/shortcuts';

// MVP-1 editor shell (Wave-3 UX layout):
//   [ Toolbar+Scenes | CanvasStage | Preview dock + tabbed panel ]  top row
//   [              TimelinePanel (full width)                   ]  bottom row
export function App() {
  // When non-null: the previous session's autosave was ALREADY restored at
  // boot (silently, no click) and this is a small toast offering "Start fresh".
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  // Timeline footer height in vh (DAW-style draggable divider, default 34).
  const [timelineH, setTimelineH] = useState(34);
  // Left library width (px) — draggable, persisted. Default 360 (was 250).
  const LEFT_W_KEY = 'sls-left-w';
  const [leftW, setLeftW] = useState(() => {
    const raw = Number(localStorage.getItem(LEFT_W_KEY));
    return Number.isFinite(raw) ? Math.min(520, Math.max(280, raw)) : 360;
  });
  // Big-screen preview: when true the SAME <PreviewPanel> instance is moved
  // into a fullscreen overlay (never mounted twice -> one Player, one clock).
  const [previewBig, setPreviewBig] = useState(false);

  useEffect(() => {
    if (!previewBig) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewBig(false);
      // CapCut muscle memory: Space toggles playback while on big screen.
      if (e.key === ' ' && !isTypingTarget(e.target)) {
        e.preventDefault();
        usePlaybackStore.getState().toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewBig]);

  /** Drag the divider above the timeline to grow/shrink it (clamped 14–70vh). */
  const startTimelineResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = timelineH;
    const onMove = (ev: PointerEvent) => {
      const vh = window.innerHeight || 1080;
      const next = startH + ((startY - ev.clientY) / vh) * 100;
      setTimelineH(Math.min(70, Math.max(14, next)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Drag the vertical divider between left library and canvas (280–520px, persisted). */
  const startLeftResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftW;
    const onMove = (ev: PointerEvent) => {
      const next = startW + (ev.clientX - startX);
      setLeftW(Math.min(520, Math.max(280, next)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // Persist the final width (read fresh from closure via next frame).
      // Use a microtask so leftW has settled.
      setTimeout(() => {
        const cur = (document.querySelector('.app-side.left') as HTMLElement | null)?.offsetWidth;
        if (cur) localStorage.setItem(LEFT_W_KEY, String(Math.min(520, Math.max(280, cur))));
      }, 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // The scene lives only in memory — warn before losing unsaved work.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useSceneStore.getState().past.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
      // NEVER clear the autosave here. It is persistent session state, not
      // crash-only recovery: wiping it on every normal close/reload destroyed
      // unsaved work (the reload data-loss bug). The RestoreBanner decides
      // recover-vs-discard on next launch instead.
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // On mount, RESUME the previous session automatically: if an autosave
  // exists, load it straight into the store — no click, no banner. The user
  // lands exactly where they left off; a small toast offers "Start fresh".
  useEffect(() => {
    let alive = true;
    loadAutosave()
      .then((a) => {
        if (!alive || !a) return;
        useSceneStore.getState().loadProjectFromJson(JSON.stringify(a.project));
        setRestoredAt(a.savedAt);
      })
      .catch(() => {});
    // Ask Chrome to treat our IndexedDB as persistent (never evict under
    // disk pressure). Fire-and-forget: unsupported browsers just ignore it.
    void navigator.storage?.persist?.().catch(() => {});
    return () => { alive = false; };
  }, []);

  // Debounced autosave: only real content edits (scene / inactiveScenes /
  // activeSceneId changing) trigger a write — selection/tool changes don't.
  // The debounce shrinks the 0.8s loss window to ZERO at the moments a tab
  // actually goes away: hidden (tab switch/minimize) and pagehide (close,
  // reload, navigate) both flush any pending write immediately.
  useEffect(() => {
    const debounced = debounce(() => {
      void saveAutosave(useSceneStore.getState().getProject()).catch(() => {});
    }, 800);
    const onHidden = () => { if (document.hidden) debounced.flush(); };
    const onPageHide = () => debounced.flush();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    const unsub = useSceneStore.subscribe((state, prev) => {
      const same =
        state.scene === prev.scene &&
        state.inactiveScenes === prev.inactiveScenes &&
        state.activeSceneId === prev.activeSceneId;
      if (!same) debounced();
    });
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      debounced.cancel();
    };
  }, []);

  /** "Start fresh" on the resume toast: wipe the autosave + reset the store. */
  const onStartFresh = async () => {
    await clearAutosave();
    const fresh = createDefaultScene();
    useSceneStore.setState({
      scene: fresh,
      inactiveScenes: {},
      activeSceneId: fresh.id,
      past: [],
      future: [],
      selectedObjId: undefined,
      selectedIds: [],
    });
    setRestoredAt(null);
  };

  // Global editor shortcuts (⌘D duplicate / ⌘G group / ⌘⇧G ungroup /
  // Delete remove). The handler ignores text-entry targets itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      handleEditorShortcut(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      {restoredAt !== null && (
        <SessionToast savedAt={restoredAt} onStartFresh={onStartFresh} />
      )}
      <AutoKfToast />
      <div className="app-main">
        <div className="app-side left" style={{ width: leftW }}>
          {/* Asset library is the left column now (owner workflow: everything
               is an imported sprite); the old Toolbar's canvas actions moved
               to the CanvasActionBar above the stage. */}
          <AssetsPanel />
          <ScenesPanel />
        </div>
        <div
          className="panel-resizer"
          data-testid="panel-resizer"
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize the library"
          onPointerDown={startLeftResize}
        />
        <div className="canvas-center">
          <CanvasActionBar />
          <div className="canvas-scroll">
            <CanvasStage />
          </div>
        </div>
        <div className="app-right">
          {/* Program monitor pinned at eye level (Premiere-style): the
              playing window is visible at first sight, never buried. */}
          <div className="preview-dock">
            <button
              type="button"
              className="preview-expand"
              data-testid="preview-expand"
              title="Big screen (Esc to close)"
              onClick={() => setPreviewBig(true)}
            >
              ⛶
            </button>
            {previewBig ? (
              <div className="preview-dock-placeholder" data-testid="preview-dock-placeholder">
                Preview on big screen
              </div>
            ) : (
              <PreviewPanel />
            )}
          </div>
          <RightPanel />
        </div>
      </div>
      {previewBig && (
        <div
          className="preview-overlay"
          data-testid="preview-overlay"
          onClick={() => setPreviewBig(false)}
        >
          <div
            className="preview-overlay-stage"
            onClick={(e) => e.stopPropagation()}
          >
            <PreviewPanel />
            <TransportControls />
            <button
              type="button"
              className="preview-collapse"
              data-testid="preview-collapse"
              title="Close big screen (Esc)"
              onClick={() => setPreviewBig(false)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <div
        className="timeline-resizer"
        data-testid="timeline-resizer"
        role="separator"
        aria-orientation="horizontal"
        title="Drag to resize the timeline"
        onPointerDown={startTimelineResize}
      />
      <div className="bottom-row" style={{ height: `${timelineH}vh` }}>
        <TimelinePanel />
      </div>
    </div>
  );
}

export default App;
