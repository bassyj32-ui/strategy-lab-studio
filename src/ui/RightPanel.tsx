import { useState } from 'react';
import { Inspector } from './Inspector';
import { ArmiesPanel } from './ArmiesPanel';
import { AiCommanderPanel } from './AiCommanderPanel';

type TabKey = 'armies' | 'object' | 'ai';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'armies', label: 'Armies' },
  { key: 'object', label: 'Object' },
  { key: 'ai', label: 'AI' },
];

/**
 * Tabbed right column (owner redesign): [ Armies ] [ Object ] [ AI ].
 * Armies (the army tree + layers disclosure) is the DEFAULT tab — it is the
 * commander's home base. Object = Inspector with keyframes first. Layers is
 * no longer its own tab; it lives inside Armies as a collapsed section. The
 * Assets library remains in the LEFT column.
 */
export function RightPanel() {
  const [tab, setTab] = useState<TabKey>('armies');

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
        {tab === 'ai' && <AiCommanderPanel />}
      </div>
    </div>
  );
}
