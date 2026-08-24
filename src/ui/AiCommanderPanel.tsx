import { useState } from 'react';
import { useSceneStore } from '../scene/store';
import {
  createProvider,
  loadAISettings,
  saveAISettings,
  type AISettings,
} from '../ai/provider';
import { requestProposal, type Proposal } from '../ai/executor';

interface ThreadEntry {
  kind: 'order' | 'reply' | 'system';
  text: string;
}

/**
 * AI COMMANDER PANEL (P3 v1, owner-approved). One command cycle per send:
 * order → provider → VALIDATED proposals → human Approve/Reject gate →
 * ONE undoable "AI Change #N" store transaction. The Studio works fully
 * without this panel (§64); the API key lives only in localStorage.
 */
export function AiCommanderPanel() {
  const [settings, setSettings] = useState<AISettings>(loadAISettings);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const patchSettings = (patch: Partial<AISettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAISettings(patch);
  };

  const send = async () => {
    const order = prompt.trim();
    if (!order || busy) return;
    setError(null);
    setPrompt('');
    setThread((t) => [...t, { kind: 'order', text: order }]);
    setBusy(true);
    try {
      const state = useSceneStore.getState();
      const result = await requestProposal(
        createProvider(),
        settings,
        order,
        {
          scene: state.scene,
          selectedObjId: state.selectedObjId,
          selectedIds: state.selectedIds,
        }
      );
      setThread((t) => [
        ...t,
        ...(result.text ? [{ kind: 'reply' as const, text: result.text }] : []),
        ...result.errors.map((e) => ({ kind: 'system' as const, text: `Rejected: ${e}` })),
      ]);
      if (result.resolved.length > 0) setProposal(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const approve = () => {
    if (!proposal) return;
    const { applied, errors } = useSceneStore
      .getState()
      .applyAIBatch(proposal.resolved);
    setThread((t) => [
      ...t,
      { kind: 'system', text: `Applied ${applied} op(s) as one undoable AI change.` },
      ...errors.map((e) => ({ kind: 'system' as const, text: `Failed: ${e}` })),
    ]);
    setProposal(null);
  };

  const reject = () => {
    setThread((t) => [...t, { kind: 'system', text: 'Proposal rejected.' }]);
    setProposal(null);
  };

  return (
    <div className="assets-panel ai-panel" data-testid="ai-commander-panel">
      <div className="panel-header">
        <span>AI Commander</span>
      </div>

      <div className="ai-settings" data-testid="ai-settings">
        <input
          type="password"
          placeholder="DeepSeek API key"
          data-testid="ai-key-input"
          value={settings.apiKey}
          onChange={(e) => patchSettings({ apiKey: e.target.value })}
        />
        <input
          type="text"
          placeholder="model"
          data-testid="ai-model-input"
          value={settings.model}
          onChange={(e) => patchSettings({ model: e.target.value })}
        />
      </div>

      <div className="ai-thread" data-testid="ai-thread">
        {thread.length === 0 && (
          <div className="assets-empty">
            Give the Commander an order, e.g. "move the left cavalry wing to
            1400,300 and group it".
          </div>
        )}
        {thread.map((entry, i) => (
          <div key={i} className={`ai-entry ai-${entry.kind}`}>
            {entry.text}
          </div>
        ))}
      </div>

      {proposal && (
        <div className="ai-proposal" data-testid="ai-proposal">
          <div className="ai-proposal-title">
            Proposed ({proposal.summaries.length} op
            {proposal.summaries.length === 1 ? '' : 's'}):
          </div>
          <ul>
            {proposal.summaries.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <div className="ai-proposal-actions">
            <button type="button" data-testid="ai-approve" onClick={approve}>
              Approve
            </button>
            <button type="button" data-testid="ai-reject" onClick={reject}>
              Reject
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="assets-error" data-testid="ai-error">
          {error}
        </div>
      )}

      <div className="ai-compose">
        <textarea
          rows={2}
          placeholder="Order the Commander…"
          data-testid="ai-prompt-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          data-testid="ai-send"
          disabled={busy || !prompt.trim()}
          onClick={() => void send()}
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
      <div className="ai-footnote">Every approved batch is ONE undo step.</div>
    </div>
  );
}
