import { useState } from 'react';
import { Inspector } from './Inspector';
import { ArmiesPanel } from './ArmiesPanel';
import { ShapesPanel } from './ShapesPanel';

type TabKey = 'armies' | 'object' | 'shapes';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'armies', label: 'Armies' },
  { key: 'object', label: 'Object' },
  { key: 'shapes', label: 'Shapes' },
];

/**
 * Tabbed right column (owner redesign): [ Armies ] [ Object ] [ Shapes ].
 * Armies (the army tree + layers disclosure) is the DEFAULT tab — it is the
 * commander's home base. Object = Inspector with keyframes first. Shapes
 * (NEW) replaces the retired AI tab — deterministic formation building.
 * Layers is no longer its own tab; it lives inside Armies as a collapsed
 * section. The Assets library remains in the LEFT column.
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
        {tab === 'shapes' && <ShapesPanel />}
      </div>
    </div>
  );
}
