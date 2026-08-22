import type { CSSProperties } from 'react';
import { CanvasStage } from './canvas/CanvasStage';
import { Toolbar } from './ui/Toolbar';
import { Inspector } from './ui/Inspector';
import { LayersPanel } from './ui/LayersPanel';
import { PreviewPanel } from './ui/PreviewPanel';
import { TimelinePanel } from './timeline';

// MVP-1 editor shell (inline styles; no CSS framework in P0):
//   [ Toolbar | CanvasStage | Inspector + LayersPanel ]  top row
//   [        PreviewPanel + TimelinePanel           ]    bottom row
const panelStyle: CSSProperties = {
  padding: 8,
  borderRight: '1px solid #1e293b',
  overflowY: 'auto',
};

export function App() {
  return (
    <div
      className="app"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: 200, flexShrink: 0, ...panelStyle }}>
          <Toolbar />
        </div>
        <div
          className="canvas-center"
          style={{ flex: 1, minWidth: 0, overflow: 'auto' }}
        >
          <CanvasStage />
        </div>
        <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid #1e293b' }}>
          <div style={panelStyle}>
            <Inspector />
          </div>
          <div style={{ ...panelStyle, borderRight: 'none' }}>
            <LayersPanel />
          </div>
        </div>
      </div>
      <div
        className="bottom-row"
        style={{
          flexShrink: 0,
          borderTop: '1px solid #1e293b',
          maxHeight: '45vh',
          overflowY: 'auto',
        }}
      >
        <PreviewPanel />
        <TimelinePanel />
      </div>
    </div>
  );
}

export default App;
