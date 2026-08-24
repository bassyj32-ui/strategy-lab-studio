// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AiCommanderPanel } from './AiCommanderPanel';
import { useSceneStore } from '../scene/store';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';
import type { Scene } from '../scene/types';
import type { AIProvider, CompletionResult, CompletionRequest } from '../ai/provider';

// The panel builds its provider via the factory — swap in a fake so no
// network is ever touched. Settings storage stays real (jsdom localStorage).
const fakeComplete = vi.fn<(req: CompletionRequest) => Promise<CompletionResult>>();
vi.mock('../ai/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/provider')>();
  return {
    ...actual,
    createProvider: (): AIProvider => ({
      name: 'fake',
      complete: fakeComplete,
    }),
  };
});

const s = () => useSceneStore.getState();

const reset = () => {
  act(() => {
    useSceneStore.setState({
      scene: createDefaultScene(),
      inactiveScenes: {},
      past: [],
      future: [],
      selectedObjId: null,
      selectedIds: [],
      activeLayerId: DEFAULT_LAYER_ID,
    });
  });
  localStorage.clear();
  fakeComplete.mockReset();
};

const sceneWithUnit = (): Scene => {
  const scene = createDefaultScene();
  scene.objects.u1 = {
    id: 'u1',
    type: 'unit',
    faction: 'red',
    label: 'Hannibal',
    transform: { x: 400, y: 300, rotation: 0, scale: 1, opacity: 1 },
    layerId: scene.layers[0].id,
  };
  return scene;
};

describe('AiCommanderPanel', () => {
  beforeEach(reset);

  it('renders settings, composer and thread', () => {
    render(<AiCommanderPanel />);
    expect(screen.getByTestId('ai-commander-panel')).toBeTruthy();
    expect(screen.getByTestId('ai-key-input')).toBeTruthy();
    expect(screen.getByTestId('ai-model-input')).toBeTruthy();
    expect(screen.getByTestId('ai-prompt-input')).toBeTruthy();
    expect(screen.getByTestId('ai-thread')).toBeTruthy();
    // No proposal before any exchange.
    expect(screen.queryByTestId('ai-proposal')).toBeNull();
  });

  it('persists API key + model to sls.ai.* on every keystroke', () => {
    render(<AiCommanderPanel />);
    fireEvent.change(screen.getByTestId('ai-key-input'), {
      target: { value: 'sk-live-9' },
    });
    fireEvent.change(screen.getByTestId('ai-model-input'), {
      target: { value: 'deepseek-reasoner' },
    });
    expect(localStorage.getItem('sls.ai.api-key')).toBe('sk-live-9');
    expect(localStorage.getItem('sls.ai.model')).toBe('deepseek-reasoner');
  });

  it('send → proposal card → approve applies ONE undoable AI change', async () => {
    act(() => useSceneStore.setState({ scene: sceneWithUnit() }));
    fakeComplete.mockResolvedValue({
      text: 'Creating a marker.',
      proposals: [
        { tool: 'create_object', args: { type: 'marker', x: 700, y: 500, label: 'Rally Point' } },
        { tool: 'create_object', args: { type: 'unit', x: 99999, y: 0 } }, // invalid → rejected
      ],
    });

    render(<AiCommanderPanel />);
    fireEvent.change(screen.getByTestId('ai-prompt-input'), {
      target: { value: 'mark a rally point' },
    });
    fireEvent.click(screen.getByTestId('ai-send'));

    // Proposal appears with ONLY the valid op.
    await waitFor(() => expect(screen.getByTestId('ai-proposal')).toBeTruthy());
    expect(fakeComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ai-proposal').textContent).toContain('Create marker "Rally Point" at (700, 500)');
    // Validation rejection surfaces in the thread.
    expect(screen.getByTestId('ai-thread').textContent).toContain('Rejected');

    fireEvent.click(screen.getByTestId('ai-approve'));

    const created = Object.values(s().scene.objects).find(
      (o) => o.label === 'Rally Point'
    );
    expect(created).toBeDefined();
    // ONE history entry labeled as an AI change.
    expect(s().past[s().past.length - 1].label).toBe('AI Change #1');
    expect(screen.getByTestId('ai-thread').textContent).toContain('Applied 1 op(s)');
    // Proposal consumed after approval.
    expect(screen.queryByTestId('ai-proposal')).toBeNull();

    s().undo(); // the whole batch reverts together
    expect(Object.values(s().scene.objects).some((o) => o.label === 'Rally Point')).toBe(false);
  });

  it('reject discards the proposal without touching the scene', async () => {
    fakeComplete.mockResolvedValue({
      text: '',
      proposals: [{ tool: 'set_vignette', args: { on: true } }],
    });
    render(<AiCommanderPanel />);
    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'drama' } });
    fireEvent.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(screen.getByTestId('ai-proposal')).toBeTruthy());

    fireEvent.click(screen.getByTestId('ai-reject'));
    expect(s().scene.vignette).toBeUndefined();
    expect(s().past).toHaveLength(0);
    expect(screen.getByTestId('ai-thread').textContent).toContain('rejected');
  });

  it('surfaces sanitized provider failures as errors (never crashes)', async () => {
    fakeComplete.mockRejectedValue(new Error('Could not reach the AI endpoint (network or CORS).'));
    render(<AiCommanderPanel />);
    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('ai-send'));
    await waitFor(() =>
      expect(screen.getByTestId('ai-error').textContent).toContain('network or CORS')
    );
    expect(screen.queryByTestId('ai-proposal')).toBeNull();
    // The failure is recoverable: composer is usable again.
    const prompt = screen.getByTestId('ai-prompt-input') as HTMLTextAreaElement;
    fireEvent.change(prompt, { target: { value: 'try again' } });
    expect((screen.getByTestId('ai-send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('reply-only responses show prose but no proposal card; busy state toggles', async () => {
    let resolveFn!: (v: CompletionResult) => void;
    fakeComplete.mockReturnValue(new Promise((res) => (resolveFn = res)));
    render(<AiCommanderPanel />);

    const send = screen.getByTestId('ai-send') as HTMLButtonElement;
    const prompt = screen.getByTestId('ai-prompt-input') as HTMLTextAreaElement;

    // Empty order → send is disabled.
    expect(send.disabled).toBe(true);

    fireEvent.change(prompt, { target: { value: 'deploy' } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    // The order clears the textarea; while awaiting, busy shows as '…'.
    expect(send.textContent).toBe('…');

    resolveFn({ text: 'Nothing to do — scene already staged.', proposals: [] });
    await waitFor(() => expect(send.textContent).toBe('Send'));
    // Reply-only response leaves NO proposal card behind.
    expect(screen.queryByTestId('ai-proposal')).toBeNull();
    expect(screen.getByTestId('ai-thread').textContent).toContain(
      'Nothing to do'
    );
  });

  it('replays prior orders as context on the next send (§A memory)', async () => {
    fakeComplete.mockImplementation(async (req) => {
      // Capture the built request to confirm history replay.
      (fakeComplete as unknown as { lastReq?: unknown }).lastReq = req;
      return { text: 'done', proposals: [] };
    });
    const getReq = () =>
      (fakeComplete as unknown as { lastReq?: { messages: { role: string; content: string }[] } })
        .lastReq;

    render(<AiCommanderPanel />);
    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'first order' } });
    fireEvent.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(screen.getByTestId('ai-thread').textContent).toContain('first order'));

    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'second order' } });
    fireEvent.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(screen.getByTestId('ai-thread').textContent).toContain('second order'));

    const msgs = getReq()!.messages;
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs[1].content).toContain('Prior order: first order');
    expect(msgs[2].content).toContain('done'); // prior reply replayed
  });

  it('respects the remember toggle (off → no replay)', async () => {
    fakeComplete.mockImplementation(async (req) => {
      (fakeComplete as unknown as { lastReq?: { messages: { role: string }[] } }).lastReq = req;
      return { text: 'done', proposals: [] };
    });
    const getReq = () =>
      (fakeComplete as unknown as { lastReq?: { messages: { role: string }[] } }).lastReq;

    render(<AiCommanderPanel />);
    fireEvent.click(screen.getByTestId('ai-remember-input')); // turn OFF
    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'first' } });
    fireEvent.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(screen.getByTestId('ai-thread').textContent).toContain('first'));
    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'second' } });
    fireEvent.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(screen.getByTestId('ai-thread').textContent).toContain('second'));

    const msgs = getReq()!.messages;
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user']); // no replay
  });

  it('shows AI Change history with one-click undo', async () => {
    fakeComplete.mockResolvedValue({
      text: 'Created.',
      proposals: [{ tool: 'set_vignette', args: { on: true } }],
    });
    render(<AiCommanderPanel />);
    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'add drama' } });
    fireEvent.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(screen.getByTestId('ai-proposal')).toBeTruthy());
    fireEvent.click(screen.getByTestId('ai-approve'));
    expect(s().scene.vignette).toBe(true);

    fireEvent.click(screen.getByTestId('ai-history-toggle'));
    expect(screen.getByTestId('ai-history')).toBeTruthy();
    expect(screen.getByTestId('ai-history').textContent).toContain('AI Change #1');
    fireEvent.click(screen.getByTestId('ai-history-undo'));
    expect(s().scene.vignette).toBeUndefined(); // undone
  });

  it('renders §104 diff cards with APPLY/MODIFY modes for keyframe ops', async () => {
    const scene = sceneWithUnit();
    scene.keyframes.u1 = [
      { time: 2, transform: { x: 400, y: 300, rotation: 0, scale: 1, opacity: 1 } },
    ];
    act(() => useSceneStore.setState({ scene }));
    fakeComplete.mockResolvedValue({
      text: 'Animate.',
      proposals: [
        { tool: 'set_keyframe', args: { target: 'Hannibal', time: 4, x: 900, opacity: 0.3 } }, // new → APPLY
        { tool: 'set_keyframe', args: { target: 'Hannibal', time: 2, rotation: 90 } }, // existing → MODIFY
      ],
    });
    render(<AiCommanderPanel />);
    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'animate the wing' } });
    fireEvent.click(screen.getByTestId('ai-send'));

    await waitFor(() => expect(screen.getByTestId('ai-proposal')).toBeTruthy());
    // Card 0 = APPLY (no prior keyframe at t=4).
    expect(screen.getByTestId('ai-diff-mode-0').textContent).toBe('APPLY');
    expect(screen.getByTestId('ai-diff-kf-0').textContent).toContain('new');
    // Card 1 = MODIFY (keyframe at t=2 already exists), shows before→after.
    expect(screen.getByTestId('ai-diff-mode-1').textContent).toBe('MODIFY');
    expect(screen.getByTestId('ai-diff-kf-1').textContent).toContain('before');
    expect(screen.getByTestId('ai-diff-kf-1').textContent).toContain('after');

    fireEvent.click(screen.getByTestId('ai-approve'));
    const kfs = Object.values(s().scene.keyframes)[0]!;
    expect(kfs).toHaveLength(2); // both keyframes applied together
  });

  it('per-op REJECT drops a card but still applies the rest as one batch', async () => {
    const scene = sceneWithUnit();
    scene.keyframes.u1 = [
      { time: 2, transform: { x: 400, y: 300, rotation: 0, scale: 1, opacity: 1 } },
    ];
    act(() => useSceneStore.setState({ scene }));
    fakeComplete.mockResolvedValue({
      text: 'Animate both.',
      proposals: [
        { tool: 'set_keyframe', args: { target: 'Hannibal', time: 4, x: 900 } },
        { tool: 'set_keyframe', args: { target: 'Hannibal', time: 2, rotation: 90 } },
      ],
    });
    render(<AiCommanderPanel />);
    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'animate' } });
    fireEvent.click(screen.getByTestId('ai-send'));
    await waitFor(() => expect(screen.getByTestId('ai-proposal')).toBeTruthy());

    // Reject the first op (APPLY at t=4).
    fireEvent.click(screen.getByTestId('ai-diff-reject-0'));
    expect(screen.queryByTestId('ai-diff-0')).toBeNull();
    expect(screen.getByTestId('ai-diff-1')).toBeTruthy();

    fireEvent.click(screen.getByTestId('ai-approve'));
    // Only the MODIFY keyframe landed; the rejected APPLY did not.
    const kfs = Object.values(s().scene.keyframes)[0]!;
    expect(kfs).toHaveLength(1);
    expect(kfs[0].transform.rotation).toBe(90);
  });
});
