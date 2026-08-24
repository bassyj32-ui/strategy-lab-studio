import { useEffect } from 'react';
import { CanvasStage } from './canvas/CanvasStage';
import { Toolbar } from './ui/Toolbar';
import { ScenesPanel } from './ui/ScenesPanel';
import { RightPanel } from './ui/RightPanel';
import { PreviewPanel } from './ui/PreviewPanel';
import { TimelinePanel } from './timeline';
import { useSceneStore } from './scene/store';

// MVP-1 editor shell (Wave-3 UX layout):
//   [ Toolbar+Scenes | CanvasStage | Preview dock + tabbed panel ]  top row
//   [              TimelinePanel (full width)                   ]  bottom row
export function App() {
  // The scene lives only in memory — warn before losing unsaved work.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useSceneStore.getState().past.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <div className="app">
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
      <div className="bottom-row">
        <TimelinePanel />
      </div>
    </div>
  );
}

export default App;
