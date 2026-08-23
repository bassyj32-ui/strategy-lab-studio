import { useEffect } from 'react';
import { CanvasStage } from './canvas/CanvasStage';
import { Toolbar } from './ui/Toolbar';
import { Inspector } from './ui/Inspector';
import { LayersPanel } from './ui/LayersPanel';
import { ScenesPanel } from './ui/ScenesPanel';
import { PreviewPanel } from './ui/PreviewPanel';
import { TimelinePanel } from './timeline';
import { useSceneStore } from './scene/store';

// MVP-1 editor shell:
//   [ Toolbar | CanvasStage | Inspector + LayersPanel ]  top row
//   [        PreviewPanel + TimelinePanel           ]    bottom row
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
          <div className="right-section">
            <Inspector />
          </div>
          <div className="right-section">
            <LayersPanel />
          </div>
        </div>
      </div>
      <div className="bottom-row">
        <PreviewPanel />
        <TimelinePanel />
      </div>
    </div>
  );
}

export default App;
