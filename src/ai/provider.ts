// §64 PROVIDER ABSTRACTION for the AI Commander. The Studio must work fully
// without AI; the provider is swappable (DeepSeek initial) and speaks plain
// fetch against an OpenAI-compatible chat-completions endpoint so a local
// proxy or another vendor is a base-URL swap. The API key lives ONLY in
// localStorage under `sls.ai.*` (user-controlled, never committed, never
// logged) — same try/catch degradation convention as CameraHud.
import type { ToolSpec } from './tools';
import type { ProposedOp } from './tools';

export const API_KEY_STORAGE = 'sls.ai.api-key';
export const MODEL_STORAGE = 'sls.ai.model';
export const BASE_URL_STORAGE = 'sls.ai.base-url';

export const DEFAULT_MODEL = 'deepseek-chat';
export const DEFAULT_BASE_URL = 'https://api.deepseek.com';

/** User-controlled settings; persisted locally only (§64 + AGENTS secrets law). */
export interface AISettings {
  apiKey: string;
  model: string;
  baseUrl: string;
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / disabled storage: settings simply don't persist.
  }
}

function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadAISettings(): AISettings {
  return {
    apiKey: storageGet(API_KEY_STORAGE) ?? '',
    model: storageGet(MODEL_STORAGE) ?? DEFAULT_MODEL,
    baseUrl: storageGet(BASE_URL_STORAGE) ?? DEFAULT_BASE_URL,
  };
}

export function saveAISettings(settings: Partial<AISettings>): void {
  if (settings.apiKey !== undefined) {
    if (settings.apiKey) storageSet(API_KEY_STORAGE, settings.apiKey);
    else storageRemove(API_KEY_STORAGE);
  }
  if (settings.model !== undefined) storageSet(MODEL_STORAGE, settings.model);
  if (settings.baseUrl !== undefined) storageSet(BASE_URL_STORAGE, settings.baseUrl);
}

/** One chat message in the provider-neutral request. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** What a provider must deliver: prose + structured tool proposals. */
export interface CompletionRequest {
  messages: ChatMessage[];
  tools: ToolSpec[];
}

export interface CompletionResult {
  /** Assistant prose (explanation), may be empty when only tools were called. */
  text: string;
  /** Raw proposed ops — validated downstream by ai/tools.ts, never trusted. */
  proposals: ProposedOp[];
}

/** Swappable LLM boundary (PRD §64). Implementations MUST NOT log the key. */
export interface AIProvider {
  readonly name: string;
  complete(request: CompletionRequest, settings: AISettings): Promise<CompletionResult>;
}

interface OpenAIChoice {
  message?: {
    content?: string | null;
    tool_calls?: Array<{
      type?: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
}

/**
 * DeepSeek adapter: OpenAI-compatible `/chat/completions` with function
 * calling. Errors surface as thrown Errors with SANITIZED messages (status +
 * generic reason — never the key, never the raw response body).
 */
export class DeepSeekProvider implements AIProvider {
  readonly name = 'deepseek';

  async complete(
    request: CompletionRequest,
    settings: AISettings
  ): Promise<CompletionResult> {
    if (!settings.apiKey) throw new Error('No API key configured.');
    if (!settings.model) throw new Error('No model configured.');

    let response: Response;
    try {
      response = await fetch(`${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: request.messages,
          tools: request.tools.map((t) => ({
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
          tool_choice: 'auto',
          temperature: 0.2,
        }),
      });
    } catch {
      // Network/CORS failure — sanitized; CORS hint lives in the UI copy.
      throw new Error('Could not reach the AI endpoint (network or CORS).');
    }

    if (!response.ok) {
      throw new Error(`AI request failed (${response.status}).`);
    }

    let payload: { choices?: OpenAIChoice[] };
    try {
      payload = await response.json();
    } catch {
      throw new Error('AI returned a malformed response.');
    }
    const message = payload.choices?.[0]?.message;

    const proposals: ProposedOp[] = [];
    for (const call of message?.tool_calls ?? []) {
      if (call.function?.name && call.function.arguments) {
        try {
          const parsedArgs = JSON.parse(call.function.arguments) as Record<
            string,
            unknown
          >;
          proposals.push({ tool: call.function.name, args: parsedArgs });
        } catch {
          // Malformed arguments: skip the proposal; validation layer would
          // reject it anyway, but here we keep the batch clean.
        }
      }
    }

    return { text: message?.content ?? '', proposals };
  }
}

/** Factory so the rest of the app never imports a concrete adapter directly. */
export function createProvider(_kind: 'deepseek' = 'deepseek'): AIProvider {
  void _kind; // reserved for future providers (§64 swappability)
  return new DeepSeekProvider();
}
