import { ReplicaxError } from '@/utils/errors';
import { commandExists, runWithStdin } from '@/core/ai/cli';

/**
 * The AI provider layer. `init-skill` uses *whatever the user already has*: it
 * prefers a locally-installed CLI (which carries the user's own login), and
 * falls back to a provider API key from the environment. ReplicaX never stores
 * credentials — it reuses the CLI's auth or reads a key from `process.env`.
 *
 * Each provider supports two routes. The CLI route shells out to the tool in
 * non-interactive mode; the API route calls the REST endpoint with global
 * `fetch` (no SDK dependency). Model ids for the API route default to current
 * releases and are overridable per the table below or via `--model`.
 */
export type ProviderId = 'claude' | 'openai' | 'gemini';

export interface AiInvoker {
  id: ProviderId;
  /** Human-readable route, e.g. "Claude Code CLI" or "Anthropic API". */
  via: string;
  /** Send a prompt, return the raw model text. */
  run: (prompt: string) => Promise<string>;
}

interface ProviderDef {
  id: ProviderId;
  label: string;
  /** CLI binary and the static args that put it in non-interactive mode. */
  cliBin: string;
  cliArgs: string[];
  /** Environment variables holding an API key, in priority order. */
  apiEnvVars: string[];
  /** Env var that overrides the API model id. */
  modelEnvVar: string;
  defaultModel: string;
  /** Call the provider's REST API and return the model text. */
  callApi: (prompt: string, apiKey: string, model: string) => Promise<string>;
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }
  return res.json();
}

/** Anthropic Messages API. No sampling params — current Opus rejects them. */
async function callAnthropic(prompt: string, apiKey: string, model: string): Promise<string> {
  const data = (await postJson(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    { model, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] },
  )) as { content?: Array<{ type: string; text?: string }> };
  return (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
}

/** OpenAI Chat Completions API. */
async function callOpenAI(prompt: string, apiKey: string, model: string): Promise<string> {
  const data = (await postJson(
    'https://api.openai.com/v1/chat/completions',
    { authorization: `Bearer ${apiKey}` },
    { model, messages: [{ role: 'user', content: prompt }] },
  )) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

/** Google Gemini generateContent API. */
async function callGemini(prompt: string, apiKey: string, model: string): Promise<string> {
  const data = (await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { 'x-goog-api-key': apiKey },
    { contents: [{ parts: [{ text: prompt }] }] },
  )) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

/** Provider registry, in auto-detection priority order. */
export const PROVIDERS: ProviderDef[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    cliBin: 'claude',
    cliArgs: ['-p'],
    apiEnvVars: ['ANTHROPIC_API_KEY'],
    modelEnvVar: 'REPLICAX_ANTHROPIC_MODEL',
    defaultModel: 'claude-opus-4-8',
    callApi: callAnthropic,
  },
  {
    id: 'openai',
    label: 'OpenAI Codex',
    cliBin: 'codex',
    cliArgs: ['exec'],
    apiEnvVars: ['OPENAI_API_KEY'],
    modelEnvVar: 'REPLICAX_OPENAI_MODEL',
    defaultModel: 'gpt-5.5',
    callApi: callOpenAI,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    cliBin: 'gemini',
    cliArgs: [],
    apiEnvVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    modelEnvVar: 'REPLICAX_GEMINI_MODEL',
    defaultModel: 'gemini-3.5-flash',
    callApi: callGemini,
  },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

function firstEnv(vars: string[]): string | undefined {
  for (const v of vars) {
    const val = process.env[v];
    if (val && val.trim()) return val.trim();
  }
  return undefined;
}

function cliInvoker(def: ProviderDef): AiInvoker {
  return {
    id: def.id,
    via: `${def.label} CLI`,
    run: async (prompt) => (await runWithStdin(def.cliBin, def.cliArgs, prompt)).stdout,
  };
}

function apiInvoker(def: ProviderDef, apiKey: string, modelOverride?: string): AiInvoker {
  const model = modelOverride ?? process.env[def.modelEnvVar] ?? def.defaultModel;
  return {
    id: def.id,
    via: `${def.label} API (${model})`,
    run: (prompt) => def.callApi(prompt, apiKey, model),
  };
}

/**
 * Resolve an AI invoker. With no `preference`, scans providers in priority order
 * and returns the first whose CLI is installed or whose API key is set (or null
 * if none). With a `preference`, returns that provider or throws if it's unknown
 * or unavailable.
 */
export async function resolveProvider(
  preference?: string,
  modelOverride?: string,
): Promise<AiInvoker | null> {
  if (preference) {
    const def = PROVIDERS.find((p) => p.id === preference);
    if (!def) {
      throw new ReplicaxError(`Unknown provider "${preference}".`, [
        `Valid providers: ${PROVIDER_IDS.join(', ')}.`,
      ]);
    }
    if (await commandExists(def.cliBin)) return cliInvoker(def);
    const key = firstEnv(def.apiEnvVars);
    if (key) return apiInvoker(def, key, modelOverride);
    throw new ReplicaxError(`Provider "${preference}" is not available.`, [
      `Install its CLI (\`${def.cliBin}\`) or set ${def.apiEnvVars[0]}.`,
    ]);
  }

  for (const def of PROVIDERS) {
    if (await commandExists(def.cliBin)) return cliInvoker(def);
    const key = firstEnv(def.apiEnvVars);
    if (key) return apiInvoker(def, key, modelOverride);
  }
  return null;
}
