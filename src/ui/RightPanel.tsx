import { useState } from 'react';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { AiCommanderPanel } from './AiCommanderPanel';

type TabKey = 'properties' | 'layers' | 'ai';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'properties', label: 'Properties' },
  { key: 'layers', label: 'Layers' },
  { key: 'ai', label: 'AI' },
];

/**
 * Tabbed right column (Wave-3 UX pass): one dock instead of stacked panels,
 * so nothing scrolls off-screen. Pure view composition — every tab renders
 * its existing panel unchanged. The Assets library lives in the LEFT column
 * now (owner call), so there is no assets tab here anymore.
 */
export function RightPanel() {
  const [tab, setTab] = useState<TabKey>('properties');

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
        {tab === 'properties' && <Inspector />}
        {tab === 'layers' && <LayersPanel />}
        {tab === 'ai' && <AiCommanderPanel />}
      </div>
    </div>
  );
}
