import { describe, it, expect } from 'vitest';
import { requestProposal, describeOp, computeOpDiff } from './executor';
import type { AIProvider, CompletionRequest, CompletionResult } from './provider';
import { TOOL_SPECS } from './tools';
import { createDefaultScene } from '../scene/factory';
import type { Scene } from '../scene/types';

const scene = (): Scene => {
  const s = createDefaultScene();
  s.objects = {};
  s.objects['u1'] = {
    id: 'u1',
    type: 'unit',
    faction: 'red',
    label: 'Hannibal',
    transform: { x: 400, y: 300, rotation: 0, scale: 1, opacity: 1 },
    layerId: s.layers[0].id,
  };
  return s;
};

const settings = { apiKey: 'sk-test', model: 'deepseek-chat', baseUrl: 'https://x', remember: true, maxTurns: 3 };

function fakeProvider(
  result: Partial<CompletionResult>,
  capture?: { req?: CompletionRequest }
): AIProvider {
  return {
    name: 'fake',
    async complete(req) {
      if (capture) capture.req = req;
      return {
        text: result.text ?? '',
        proposals: result.proposals ?? [],
      };
    },
  };
}

describe('requestProposal (§53-62 command cycle)', () => {
  it('sends the system rules + order + summarized scene to the provider', async () => {
    const capture: { req?: CompletionRequest } = {};
    await requestProposal(fakeProvider({}, capture), settings, 'deploy the left wing', {
      scene: scene(),
      selectedObjId: 'u1',
    });
    const req = capture.req!;
    expect(req.tools).toBe(TOOL_SPECS); // the §54 surface, unmodified
    expect(req.messages[0].role).toBe('system');
    expect(req.messages[0].content).toContain('never invent tool names');
    expect(req.messages[0].content).toContain('10s'); // timeline fact
    expect(req.messages[1].role).toBe('user');
    expect(req.messages[1].content).toContain("Commander's order: deploy the left wing");
    // §62 summary travels inline as JSON — compact, not the raw scene.
    expect(req.messages[1].content).toContain('"armies"');
    expect(req.messages[1].content).toContain('Hannibal');
  });

  it('replays bounded prior turns before the current order (§A memory)', async () => {
    const capture: { req?: CompletionRequest } = {};
    await requestProposal(
      fakeProvider({ text: 'ok', proposals: [] }, capture),
      settings,
      'now flank them',
      {
        scene: scene(),
        history: [
          { role: 'user', content: 'create a left wing' },
          { role: 'assistant', content: 'Created the left wing.' },
          { role: 'user', content: 'group it' },
        ],
      }
    );
    const msgs = capture.req!.messages;
    // system, 3 replayed turns, final user
    expect(msgs.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'user',
    ]);
    expect(msgs[1].content).toContain('Prior order: create a left wing');
    expect(msgs[2].content).toContain('Prior reply: Created the left wing.');
    expect(msgs[4].content).toContain("Commander's order: now flank them");
  });

  it('validates proposals BEFORE anything else; invalid ops become errors', async () => {
    const proposal = await requestProposal(
      fakeProvider({
        text: 'Moving him right.',
        proposals: [
          { tool: 'move_objects', args: { targets: ['Hannibal'], dx: 100, dy: 0 } },
          { tool: 'create_object', args: { type: 'unit', x: 99999, y: 0 } }, // out of bounds
          { tool: 'launch_nukes' }, // unknown tool
        ],
      }),
      settings,
      'shift Hannibal east',
      { scene: scene() }
    );
    expect(proposal.resolved.map((r) => r.tool)).toEqual(['move_objects']);
    expect(proposal.summaries).toEqual(['Move 1 object(s) by (100, 0)']);
    expect(proposal.errors).toHaveLength(2);
    expect(proposal.errors.some((e) => e.includes('outside the map'))).toBe(true);
    expect(proposal.errors.some((e) => e.includes('unknown tool'))).toBe(true);
  });

  it('is purely read-side: the scene object is never mutated', async () => {
    const s = scene();
    const before = JSON.stringify(s);
    await requestProposal(
      fakeProvider({
        proposals: [{ tool: 'set_vignette', args: { on: true } }],
      }),
      settings,
      'add drama',
      { scene: s }
    );
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('describeOp (proposal card copy)', () => {
  it('renders one human line per op kind', () => {
    expect(describeOp({ tool: 'create_object', type: 'unit', x: 800, y: 400, label: 'Skirmishers' })).toBe(
      'Create unit "Skirmishers" at (800, 400)'
    );
    expect(describeOp({ tool: 'move_objects', ids: ['a'], dx: 5, dy: -5 })).toBe(
      'Move 1 object(s) by (5, -5)'
    );
    expect(describeOp({ tool: 'move_objects', ids: ['a'], x: 12.6, y: 7.4 })).toBe(
      'Move object to (13, 7)'
    );
    expect(describeOp({ tool: 'set_camera_keyframe', time: 4 })).toBe('Camera keyframe @ 4s');
    expect(describeOp({ tool: 'toggle_closing_card', on: true })).toBe('Enable closing card');
    expect(describeOp({ tool: 'trigger_decisive_move', opts: {} })).toBe('Decisive move macro');
    expect(
      describeOp({ tool: 'apply_motion_preset', kind: 'march', ids: ['a', 'b'], opts: {} })
    ).toBe('march preset on 2 object(s)');
    expect(
      describeOp({ tool: 'apply_motion_preset', kind: 'camera-push', ids: [], opts: {} })
    ).toBe('camera-push preset');
    expect(describeOp({ tool: 'update_brand' })).toBe('Brand metadata update');
  });
});

describe('computeOpDiff (§104 before→after preview)', () => {
  const kfScene = (): Scene => {
    const s = scene();
    s.keyframes.u1 = [
      { time: 2, transform: { x: 400, y: 300, rotation: 0, scale: 1, opacity: 1 } },
    ];
    return s;
  };

  it('flags an APPLY when no keyframe exists at that time', () => {
    const d = computeOpDiff(
      { tool: 'set_keyframe', id: 'u1', time: 5, transform: { x: 700, opacity: 0.4 } },
      scene()
    );
    expect(d.mode).toBe('apply');
    expect(d.keyframe?.mode).toBe('apply');
    expect(d.keyframe?.before).toBeUndefined();
    expect(d.keyframe?.after).toEqual({ x: 700, y: 300, rotation: 0, scale: 1, opacity: 0.4 });
  });

  it('flags a MODIFY (with before→after) when a keyframe already exists', () => {
    const d = computeOpDiff(
      { tool: 'set_keyframe', id: 'u1', time: 2, transform: { rotation: 90 } },
      kfScene()
    );
    expect(d.mode).toBe('modify');
    expect(d.keyframe?.before).toEqual({ x: 400, y: 300, rotation: 0, scale: 1, opacity: 1 });
    expect(d.keyframe?.after?.rotation).toBe(90);
    expect(d.keyframe?.after?.x).toBe(400); // unchanged fields preserved
  });

  it('flags REMOVE for a removal op', () => {
    const d = computeOpDiff(
      { tool: 'set_keyframe', id: 'u1', time: 2, transform: {}, remove: true },
      kfScene()
    );
    expect(d.mode).toBe('remove');
    expect(d.keyframe).toBeUndefined();
  });

  it('non-keyframe ops are plain APPLY entries, read-only guarantee', () => {
    const s = scene();
    const before = JSON.stringify(s);
    computeOpDiff({ tool: 'set_vignette', on: true }, s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('requestProposal suggestion mode (Slice C)', () => {
  it('instructs the model to propose improvements and tolerates an empty order', async () => {
    const capture: { req?: CompletionRequest } = {};
    await requestProposal(
      fakeProvider({ text: 'ok', proposals: [] }, capture),
      settings,
      '',
      { scene: scene() },
      'suggest'
    );
    expect(capture.req!.messages[0].content).toContain('SUGGESTION MODE');
    expect(capture.req!.messages[capture.req!.messages.length - 1].content).toContain(
      'suggest improvements'
    );
  });

  it('still validates proposals in suggestion mode (no free pass)', async () => {
    const proposal = await requestProposal(
      fakeProvider({
        text: '',
        proposals: [{ tool: 'create_object', args: { type: 'unit', x: 99999, y: 0 } }],
      }),
      settings,
      '',
      { scene: scene() },
      'suggest'
    );
    expect(proposal.resolved).toHaveLength(0);
    expect(proposal.errors.length).toBeGreaterThan(0);
  });
});
