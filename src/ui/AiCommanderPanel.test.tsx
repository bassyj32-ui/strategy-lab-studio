// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AiCommanderPanel } from './AiCommanderPanel';
import { useSceneStore } from '../scene/store';
import { createDefaultScene, DEFAULT_LAYER_ID } from '../scene/factory';
import type { Scene } from '../scene/types';
import type { AIProvider, CompletionResult } from '../ai/provider';

// The panel builds its provider via the factory — swap in a fake so no
// network is ever touched. Settings storage stays real (jsdom localStorage).
const fakeComplete = vi.fn<() => Promise<CompletionResult>>();
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
});
