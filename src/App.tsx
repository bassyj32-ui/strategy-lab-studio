import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { CanvasStage } from './canvas/CanvasStage';
import { Toolbar } from './ui/Toolbar';
import { ScenesPanel } from './ui/ScenesPanel';
import { RightPanel } from './ui/RightPanel';
import { PreviewPanel } from './ui/PreviewPanel';
import { TimelinePanel } from './timeline';
import { useSceneStore } from './scene/store';
import type { Project } from './scene/types';
import { saveAutosave, loadAutosave, clearAutosave, debounce } from './persistence/autosave';
import { RestoreBanner } from './ui/RestoreBanner';
import { handleEditorShortcut } from './ui/shortcuts';

// MVP-1 editor shell (Wave-3 UX layout):
//   [ Toolbar+Scenes | CanvasStage | Preview dock + tabbed panel ]  top row
//   [              TimelinePanel (full width)                   ]  bottom row
export function App() {
  const [pending, setPending] = useState<{ project: Project; savedAt: number } | null>(null);
  // Timeline footer height in vh (DAW-style draggable divider, default 34).
  const [timelineH, setTimelineH] = useState(34);

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

  // On mount, recover any autosaved project from a previous session.
  useEffect(() => {
    let alive = true;
    loadAutosave()
      .then((a) => { if (alive && a) setPending(a); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Debounced autosave: only real content edits (scene / inactiveScenes /
  // activeSceneId changing) trigger a write — selection/tool changes don't.
  useEffect(() => {
    const debounced = debounce(() => {
      void saveAutosave(useSceneStore.getState().getProject()).catch(() => {});
    }, 800);
    const unsub = useSceneStore.subscribe((state, prev) => {
      const same =
        state.scene === prev.scene &&
        state.inactiveScenes === prev.inactiveScenes &&
        state.activeSceneId === prev.activeSceneId;
      if (!same) debounced();
    });
    return () => { unsub(); debounced.cancel(); };
  }, []);

  const onRestore = () => {
    if (!pending) return;
    useSceneStore.getState().loadProjectFromJson(JSON.stringify(pending.project));
    setPending(null);
  };

  const onDiscard = async () => {
    await clearAutosave();
    setPending(null);
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
      {pending && (
        <RestoreBanner savedAt={pending.savedAt} onRestore={onRestore} onDiscard={onDiscard} />
      )}
      <div className="app-main">
        <div className="app-side left">
          <Toolbar />
          <ScenesPanel />
        </div>
        <div className="canvas-center">
          <CanvasStage />
        </div>
        <div className="app-right">
          {/* Program monitor pinned at eye level (Premiere-style): the
              playing window is visible at first sight, never buried. */}
          <div className="preview-dock">
            <PreviewPanel />
          </div>
          <RightPanel />
        </div>
      </div>
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
