import { useState } from 'react';
import { useSceneStore } from '../scene/store';
import {
  createProvider,
  loadAISettings,
  saveAISettings,
  type AISettings,
} from '../ai/provider';
import { requestProposal, type Proposal, type ChatTurn } from '../ai/executor';

interface ThreadEntry {
  kind: 'order' | 'reply' | 'system';
  text: string;
}

/** Compact transform readout for the diff cards (x,y · rot° · scale× · opa). */
function fmt(t: { x: number; y: number; rotation: number; scale: number; opacity: number }): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  return `x${r(t.x)},y${r(t.y)} · ${r(t.rotation)}° · ${r(t.scale)}× · ${r(t.opacity)}`;
}

/**
 * AI COMMANDER PANEL (P3 v1, owner-approved). One command cycle per send:
 * order → provider → VALIDATED proposals → human Approve/Reject gate →
 * ONE undoable "AI Change #N" store transaction. The Studio works fully
 * without this panel (§64); the API key lives only in localStorage.
 */
/** §A read-only log of prior AI Commanded changes with one-click undo. */
function AIChangeHistory() {
  const past = useSceneStore((s) => s.past);
  const undoLastAIChange = useSceneStore((s) => s.undoLastAIChange);
  const entries = past
    .map((entry, i) => ({ i, label: entry.label }))
    .filter((e): e is { i: number; label: string } => !!e.label?.startsWith('AI Change'))
    .reverse(); // most recent first

  if (entries.length === 0) {
    return (
      <div className="ai-history" data-testid="ai-history">
        <div className="assets-empty">No AI changes yet.</div>
      </div>
    );
  }

  return (
    <div className="ai-history" data-testid="ai-history">
      {entries.map((e) => (
        <div key={e.i} className="ai-history-row">
          <span className="ai-history-label">{e.label}</span>
          <button
            type="button"
            data-testid="ai-history-undo"
            onClick={() => undoLastAIChange()}
          >
            Undo
          </button>
        </div>
      ))}
    </div>
  );
}

export function AiCommanderPanel() {
  const [settings, setSettings] = useState<AISettings>(loadAISettings);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  /** §104 per-op REJECT: indices dropped from the pending batch. */
  const [dropped, setDropped] = useState<number[]>([]);
  /** §A multi-turn memory: replayed orders + replies. */
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const patchSettings = (patch: Partial<AISettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAISettings(patch);
  };

  const send = async (intent: 'command' | 'suggest' = 'command') => {
    const order = intent === 'suggest' ? '' : prompt.trim();
    if (intent !== 'suggest' && (!order || busy)) return;
    if (busy) return;
    setError(null);
    if (intent !== 'suggest') setPrompt('');
    setThread((t) => [
      ...t,
      { kind: 'order', text: intent === 'suggest' ? '✨ Suggest improvements' : order },
    ]);
    setBusy(true);
    // Bound the replayed context to the configured turn window.
    const cap = Math.max(0, settings.maxTurns) * 2;
    const replay = settings.remember && cap > 0 ? history.slice(-cap) : [];
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
          history: replay,
        },
        intent
      );
      setThread((t) => [
        ...t,
        ...(result.text ? [{ kind: 'reply' as const, text: result.text }] : []),
        ...result.errors.map((e) => ({ kind: 'system' as const, text: `Rejected: ${e}` })),
      ]);
      if (result.resolved.length > 0) {
        setProposal(result);
        setDropped([]);
      }
      const memoryOrder = intent === 'suggest' ? '✨ Suggest improvements' : order;
      // Append to memory (bounded) so the next order keeps context.
      if (settings.remember && cap > 0) {
        setHistory((h) => [
          ...h,
          { role: 'user' as const, content: memoryOrder },
          ...(result.text ? [{ role: 'assistant' as const, content: result.text }] : []),
        ].slice(-cap));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const approve = () => {
    if (!proposal) return;
    const pending = proposal.resolved.filter((_, i) => !dropped.includes(i));
    if (pending.length === 0) {
      setThread((t) => [...t, { kind: 'system', text: 'All ops rejected.' }]);
      setProposal(null);
      setDropped([]);
      return;
    }
    const { applied, errors } = useSceneStore
      .getState()
      .applyAIBatch(pending);
    setThread((t) => [
      ...t,
      { kind: 'system', text: `Applied ${applied} op(s) as one undoable AI change.` },
      ...errors.map((e) => ({ kind: 'system' as const, text: `Failed: ${e}` })),
    ]);
    setProposal(null);
    setDropped([]);
  };

  const rejectOp = (i: number) => {
    setDropped((d) => (d.includes(i) ? d : [...d, i]));
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
        <label className="ai-remember" title="Replay prior orders so the Commander keeps context">
          <input
            type="checkbox"
            data-testid="ai-remember-input"
            checked={settings.remember}
            onChange={(e) => patchSettings({ remember: e.target.checked })}
          />
          remember
        </label>
        <input
          type="number"
          min={0}
          max={10}
          title="Turns of context to replay"
          data-testid="ai-max-turns-input"
          value={settings.maxTurns}
          onChange={(e) => patchSettings({ maxTurns: Number(e.target.value) })}
        />
      </div>

      <div className="ai-history-toggle">
        <button
          type="button"
          data-testid="ai-history-toggle"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? 'Hide' : 'Show'} AI change history
        </button>
      </div>
      {showHistory && <AIChangeHistory />}

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
            {(() => {
              const pending = proposal.resolved.length - dropped.length;
              return `Proposed ${pending} op${pending === 1 ? '' : 's'} (§104 diff):`;
            })()}
          </div>
          {proposal.resolved.map((_, i) => {
            if (dropped.includes(i)) return null;
            const diff = proposal.diffs[i];
            return (
              <div key={i} className="ai-diff" data-testid={`ai-diff-${i}`}>
                <span
                  className={`ai-diff-mode ai-diff-${diff.mode}`}
                  data-testid={`ai-diff-mode-${i}`}
                >
                  {diff.mode.toUpperCase()}
                </span>
                <span className="ai-diff-title">{diff.title}</span>
                {diff.keyframe && (
                  <span className="ai-diff-kf" data-testid={`ai-diff-kf-${i}`}>
                    {diff.keyframe.before
                      ? `before (${fmt(diff.keyframe.before)}) → after (${fmt(diff.keyframe.after)})`
                      : `new (${fmt(diff.keyframe.after)})`}
                  </span>
                )}
                <button
                  type="button"
                  className="ai-diff-reject"
                  data-testid={`ai-diff-reject-${i}`}
                  onClick={() => rejectOp(i)}
                >
                  ✕
                </button>
              </div>
            );
          })}
          <div className="ai-proposal-actions">
            <button type="button" data-testid="ai-approve" onClick={approve}>
              Approve
            </button>
            <button type="button" data-testid="ai-reject" onClick={reject}>
              Reject all
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
        <div className="ai-compose-buttons">
          <button
            type="button"
            data-testid="ai-send"
            disabled={busy || !prompt.trim()}
            onClick={() => void send()}
          >
            {busy ? '…' : 'Send'}
          </button>
          <button
            type="button"
            className="ai-suggest"
            data-testid="ai-suggest"
            disabled={busy}
            title="Ask the Commander to propose improvements for this scene"
            onClick={() => void send('suggest')}
          >
            ✨ Suggest
          </button>
        </div>
      </div>
      <div className="ai-footnote">Every approved batch is ONE undo step.</div>
    </div>
  );
}
