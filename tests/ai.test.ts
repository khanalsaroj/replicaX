import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractJson, parseSkillBundle } from '@/core/ai/bundle';
import { buildSkillPrompt } from '@/core/ai/prompt';
import {
  ApiHttpError,
  enrichProviderError,
  PROVIDERS,
  resolveProvider,
  PROVIDER_IDS,
} from '@/core/ai/providers';
import { commandExists } from '@/core/ai/cli';
import { SKILL_TARGET_BY_ID } from '@/config/ai-targets';
import { ReplicaxError } from '@/utils/errors';

describe('extractJson', () => {
  it('returns the object from raw JSON', () => {
    expect(extractJson('{"files":[]}')).toBe('{"files":[]}');
  });

  it('strips markdown code fences', () => {
    const raw = 'Here you go:\n```json\n{"files":[{"path":"SKILL.md","content":"x"}]}\n```\nDone.';
    expect(extractJson(raw)).toBe('{"files":[{"path":"SKILL.md","content":"x"}]}');
  });

  it('returns null when there is no object', () => {
    expect(extractJson('no json here')).toBeNull();
  });

  it('handles a fenced bundle whose content contains its own code fences', () => {
    // The real-world failure: the model wraps JSON in ```json and the SKILL.md
    // content has ```bash blocks. Slicing first { … last } must capture it all.
    const bundle = {
      files: [{ path: 'SKILL.md', content: '# Setup\n```bash\nnpm install\n```\n' }],
    };
    const raw = '```json\n' + JSON.stringify(bundle) + '\n```';
    const files = parseSkillBundle(raw);
    expect(files).not.toBeNull();
    expect(files?.map((f) => f.path)).toEqual(['SKILL.md']);
    expect(files?.[0]?.content).toContain('npm install');
  });
});

describe('parseSkillBundle', () => {
  it('parses a valid bundle', () => {
    const raw = JSON.stringify({
      files: [
        { path: 'SKILL.md', content: '---\nname: x\n---\n' },
        { path: 'references/commands.md', content: '# Commands' },
      ],
    });
    const files = parseSkillBundle(raw);
    expect(files).not.toBeNull();
    expect(files?.map((f) => f.path)).toEqual(['SKILL.md', 'references/commands.md']);
  });

  it('rejects the whole bundle if any path escapes the directory', () => {
    const raw = JSON.stringify({
      files: [
        { path: 'SKILL.md', content: 'ok' },
        { path: '../../etc/passwd', content: 'evil' },
      ],
    });
    expect(parseSkillBundle(raw)).toBeNull();
  });

  it('rejects absolute paths', () => {
    const raw = JSON.stringify({ files: [{ path: '/etc/hosts', content: 'x' }] });
    expect(parseSkillBundle(raw)).toBeNull();
  });

  it('returns null for malformed or empty bundles', () => {
    expect(parseSkillBundle('not json')).toBeNull();
    expect(parseSkillBundle('{"files":[]}')).toBeNull();
    expect(parseSkillBundle('{"nope":1}')).toBeNull();
  });
});

describe('buildSkillPrompt', () => {
  it('embeds the slug, entry file, target, analysis, tooling, and scripts', () => {
    const prompt = buildSkillPrompt({
      slug: 'sample',
      entryFile: 'SKILL.md',
      entryPath: '.codex/skills/sample/SKILL.md',
      target: SKILL_TARGET_BY_ID.get('codex')!,
      analysis: 'PROJECT IS REACT/TS',
      toolingPaths: ['tsconfig.json', 'vite.config.ts'],
      scripts: { build: 'tsc', test: 'vitest' },
    });
    expect(prompt).toContain('name: sample');
    expect(prompt).toContain('"SKILL.md"');
    expect(prompt).toContain('OpenAI Codex');
    expect(prompt).toContain('PROJECT IS REACT/TS');
    expect(prompt).toContain('tsconfig.json');
    expect(prompt).toContain('build: tsc');
    // Must instruct JSON-only output and forbid traversal.
    expect(prompt).toContain('single JSON object');
    expect(prompt).toContain('".."');
  });

  const baseArgs = {
    slug: 'sample',
    entryFile: 'SKILL.md',
    entryPath: '.codex/skills/sample/SKILL.md',
    target: SKILL_TARGET_BY_ID.get('codex')!,
    analysis: 'PROJECT IS REACT/TS',
    toolingPaths: ['tsconfig.json'],
    scripts: { build: 'tsc' },
  };

  it('embeds a root SKILL.md template and its honouring rule when provided', () => {
    const prompt = buildSkillPrompt({
      ...baseArgs,
      rootSkill: '# My House Style\n\nAlways mention the deploy step.',
    });
    expect(prompt).toContain('USER SKILL TEMPLATE');
    expect(prompt).toContain('# My House Style');
    expect(prompt).toContain('Always mention the deploy step.');
    // The rule that pins the template as the base must be present too.
    expect(prompt).toContain('root SKILL.md');
  });

  it('omits the template section when no root SKILL.md is given (or it is blank)', () => {
    expect(buildSkillPrompt(baseArgs)).not.toContain('USER SKILL TEMPLATE');
    expect(buildSkillPrompt({ ...baseArgs, rootSkill: '   \n  ' })).not.toContain(
      'USER SKILL TEMPLATE',
    );
  });
});

describe('commandExists', () => {
  it('finds a binary that is definitely on PATH', async () => {
    // `node` is running this test, so it must be resolvable.
    expect(await commandExists('node')).toBe(true);
  });

  it('does not find a nonsense binary', async () => {
    expect(await commandExists('replicax-definitely-not-real-xyz')).toBe(false);
  });
});

describe('resolveProvider', () => {
  it('throws on an unknown provider id', async () => {
    await expect(resolveProvider('not-a-provider')).rejects.toThrow(/Unknown provider/);
  });

  it('exposes the known provider ids', () => {
    expect(PROVIDER_IDS).toEqual(['claude', 'openai', 'gemini']);
  });
});

const providerById = (id: string) => PROVIDERS.find((p) => p.id === id)!;

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function mockFetch(body: unknown, opts: { ok?: boolean; status?: number } = {}) {
  const calls: RecordedCall[] = [];
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ''),
    });
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      statusText: 'mock',
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return { calls };
}

describe('provider API calls (mocked fetch)', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('claude default model is the current Opus id', () => {
    expect(providerById('claude').defaultModel).toBe('claude-opus-4-8');
  });

  it('calls the Anthropic Messages API with the right shape and parses text', async () => {
    const { calls } = mockFetch({ content: [{ type: 'text', text: 'hello world' }] });
    const out = await providerById('claude').callApi('PROMPT', 'sk-ant-key', 'claude-opus-4-8');
    expect(out).toBe('hello world');

    const call = calls[0]!;
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call.headers['x-api-key']).toBe('sk-ant-key');
    expect(call.headers['anthropic-version']).toBe('2023-06-01');
    const sent = JSON.parse(call.body);
    expect(sent.model).toBe('claude-opus-4-8');
    expect(sent.max_tokens).toBeGreaterThan(0);
    expect(sent.messages[0]).toMatchObject({ role: 'user' });
    // Opus 4.x rejects sampling params — they must not be sent.
    expect(sent).not.toHaveProperty('temperature');
    expect(sent).not.toHaveProperty('top_p');
    expect(sent).not.toHaveProperty('top_k');
  });

  it('calls the OpenAI Chat Completions API and parses content', async () => {
    const { calls } = mockFetch({ choices: [{ message: { content: 'hi from openai' } }] });
    const out = await providerById('openai').callApi('PROMPT', 'sk-openai', 'some-model');
    expect(out).toBe('hi from openai');

    const call = calls[0]!;
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(call.headers['authorization']).toBe('Bearer sk-openai');
    const sent = JSON.parse(call.body);
    expect(sent.model).toBe('some-model');
    expect(sent.messages[0]).toMatchObject({ role: 'user', content: 'PROMPT' });
  });

  it('calls the Gemini generateContent API and parses parts', async () => {
    const { calls } = mockFetch({
      candidates: [{ content: { parts: [{ text: 'hi from ' }, { text: 'gemini' }] } }],
    });
    const out = await providerById('gemini').callApi('PROMPT', 'goog-key', 'gemini-test');
    expect(out).toBe('hi from gemini');

    const call = calls[0]!;
    expect(call.url).toContain('/models/gemini-test:generateContent');
    expect(call.headers['x-goog-api-key']).toBe('goog-key');
  });

  it('throws an ApiHttpError carrying the status on a non-OK response', async () => {
    mockFetch({ error: 'nope' }, { ok: false, status: 404 });
    await expect(providerById('claude').callApi('P', 'k', 'bad-model')).rejects.toBeInstanceOf(
      ApiHttpError,
    );
  });
});

describe('enrichProviderError', () => {
  it('maps a 404/400 to an actionable bad-model message with an override hint', () => {
    const def = providerById('openai');
    const err = enrichProviderError(new ApiHttpError(404, 'model not found'), def, 'gpt-x');
    expect(err).toBeInstanceOf(ReplicaxError);
    expect(err.message).toMatch(/rejected model "gpt-x"/);
    expect(err.message).toContain('REPLICAX_OPENAI_MODEL');
  });

  it('maps a 401/403 to a credentials message naming the env var', () => {
    const def = providerById('gemini');
    const err = enrichProviderError(new ApiHttpError(401, 'bad key'), def, 'gemini-x');
    expect(err.message).toMatch(/credentials/i);
    expect(err.hints.join(' ')).toContain('GEMINI_API_KEY');
  });

  it('wraps a non-HTTP error generically', () => {
    const def = providerById('claude');
    const err = enrichProviderError(new Error('socket hang up'), def, 'claude-opus-4-8');
    expect(err.message).toContain('socket hang up');
  });
});
