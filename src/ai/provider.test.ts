// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DeepSeekProvider,
  createProvider,
  loadAISettings,
  saveAISettings,
  API_KEY_STORAGE,
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  type AISettings,
} from './provider';
import { TOOL_SPECS } from './tools';

const settings = (over: Partial<AISettings> = {}): AISettings => ({
  apiKey: 'sk-test-123',
  model: 'deepseek-chat',
  baseUrl: 'https://api.example.test',
  remember: true,
  maxTurns: 3,
  ...over,
});

const jsonResponse = (payload: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as unknown as Response;

describe('AI settings storage (sls.ai.*)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('defaults when nothing is stored', () => {
    expect(loadAISettings()).toEqual({
      apiKey: '',
      model: DEFAULT_MODEL,
      baseUrl: DEFAULT_BASE_URL,
      remember: true,
      maxTurns: 3,
    });
  });

  it('persists and clears settings; empty key removes rather than storing blanks', () => {
    saveAISettings({ apiKey: 'sk-secret', model: 'deepseek-reasoner' });
    expect(localStorage.getItem(API_KEY_STORAGE)).toBe('sk-secret');
    expect(loadAISettings().model).toBe('deepseek-reasoner');
    saveAISettings({ apiKey: '' }); // clearing
    expect(localStorage.getItem(API_KEY_STORAGE)).toBeNull();
  });
});

describe('DeepSeekProvider.complete', () => {
  const provider = new DeepSeekProvider();
  const request = { messages: [{ role: 'user' as const, content: 'hi' }], tools: TOOL_SPECS };

  afterEach(() => vi.unstubAllGlobals());

  it('guards against missing credentials before any network call', async () => {
    await expect(provider.complete(request, settings({ apiKey: '' }))).rejects.toThrow(
      'No API key configured.'
    );
    await expect(
      provider.complete(request, settings({ model: '' }))
    ).rejects.toThrow('No model configured.');
  });

  it('POSTs OpenAI-compatible payloads to <baseUrl>/chat/completions with the Bearer key', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: 'Plan ready.', tool_calls: [] } }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.complete(request, settings());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      {
        method: string;
        headers: Record<string, string>;
        body: string;
      },
    ];
    expect(url).toBe('https://api.example.test/chat/completions'); // trailing-slash safe too? see below
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    // Key travels in the header — and ONLY there.
    expect(init.headers.Authorization).toBe('Bearer sk-test-123');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('deepseek-chat');
    expect(body.tool_choice).toBe('auto');
    expect(body.temperature).toBe(0.2);
    expect(body.tools[0]).toEqual({
      type: 'function',
      function: {
        name: TOOL_SPECS[0].name,
        description: TOOL_SPECS[0].description,
        parameters: TOOL_SPECS[0].parameters,
      },
    });
    expect(result.text).toBe('Plan ready.');
    expect(result.proposals).toEqual([]);
  });

  it('parses tool_calls into raw ProposedOp[] (JSON arguments)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: '',
                tool_calls: [
                  {
                    function: {
                      name: 'create_object',
                      arguments: '{"type":"unit","x":800,"y":400}',
                    },
                  },
                  {
                    function: {
                      name: 'set_vignette',
                      arguments: '{"on":true}',
                    },
                  },
                ],
              },
            },
          ],
        })
      )
    );
    const result = await provider.complete(request, settings());
    expect(result.proposals).toEqual([
      { tool: 'create_object', args: { type: 'unit', x: 800, y: 400 } },
      { tool: 'set_vignette', args: { on: true } },
    ]);
  });

  it('silently skips tool calls with unparseable arguments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                tool_calls: [
                  { function: { name: 'create_object', arguments: '{broken' } },
                  { function: { name: 'create_object' } }, // no args at all
                ],
              },
            },
          ],
        })
      )
    );
    const result = await provider.complete(request, settings());
    expect(result.proposals).toEqual([]);
  });

  it('sanitizes network failures (CORS/DNS) without leaking anything', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch https://secret-endpoint?key=sk-test-123');
      })
    );
    await expect(provider.complete(request, settings())).rejects.toThrow(
      'Could not reach the AI endpoint (network or CORS).'
    );
  });

  it('reports non-2xx statuses generically (no response body echoed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ detail: 'bad key sk-test-123' }, false, 401))
    );
    await expect(provider.complete(request, settings())).rejects.toThrow(
      'AI request failed (401).'
    );
  });

  it('reports malformed JSON payloads as a sanitized error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => {
        throw new Error('Unexpected token');
      } }) as unknown as Response)
    );
    await expect(provider.complete(request, settings())).rejects.toThrow(
      'AI returned a malformed response.'
    );
  });

  it('the factory returns a DeepSeek-backed provider by default', () => {
    expect(createProvider().name).toBe('deepseek');
  });
});
