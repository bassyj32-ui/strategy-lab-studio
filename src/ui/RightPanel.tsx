import { useState } from 'react';
import { Inspector } from './Inspector';
import { ArmiesPanel } from './ArmiesPanel';
import { ShapesPanel } from './ShapesPanel';
import { LayersPanel } from './LayersPanel';
// Audio UI is HIDDEN (not deleted): CapCut owns sound per PRD §92 — the panel
// stays out of the mount so no blob: audio can be saved into a scene and break
// export. src/audio/ + src/ui/AudioPanel.tsx remain intact for a future return.
// import { AudioPanel } from './AudioPanel';

type TabKey = 'armies' | 'object' | 'shapes' | 'layers' | 'resume';

interface RightPanelProps {
  restoredAt?: number | null;
  onStartFresh?: () => void;
}

/**
 * Tabbed right column: [ Armies ] [ Object ] [ Shapes ] [ Layers ] [ Resume ].
 * Armies is the DEFAULT tab — the commander's home base.
 * Object = Inspector with keyframes first.
 * Shapes = deterministic formation building.
 * Layers = layer management with parallax depth sliders (promoted from
 *   collapsed section inside Armies so it's always visible).
 * Resume tab appears only when a previous session was auto-restored.
 */
export function RightPanel({ restoredAt, onStartFresh }: RightPanelProps) {
  const [tab, setTab] = useState<TabKey>('armies');

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'armies', label: 'Armies' },
    { key: 'object', label: 'Object' },
    { key: 'shapes', label: 'Shapes' },
    { key: 'layers', label: 'Layers' },
    ...(restoredAt ? [{ key: 'resume' as TabKey, label: 'Resume' }] : []),
  ];

  return (
    <div className="right-panel" data-testid="right-panel">
      <div className="right-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            data-testid={`tab-${t.key}`}
            className={tab === t.key ? 'right-tab active' : 'right-tab'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="right-tab-body">
        {tab === 'armies' && <ArmiesPanel />}
        {tab === 'object' && <Inspector />}
        {tab === 'shapes' && <ShapesPanel />}
        {tab === 'layers' && <LayersPanel />}
        {tab === 'resume' && restoredAt && (
          <div className="session-resume-card">
            <p>Restored your work from {new Date(restoredAt).toLocaleString()}.</p>
            <button
              type="button"
              data-testid="session-toast-fresh"
              className="session-resume-btn"
              onClick={onStartFresh}
            >
              Start fresh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
