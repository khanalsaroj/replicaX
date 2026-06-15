import { describe, expect, it } from 'vitest';
import { extractJson, parseSkillBundle } from '@/core/ai/bundle';
import { buildSkillPrompt } from '@/core/ai/prompt';
import { resolveProvider, PROVIDER_IDS } from '@/core/ai/providers';
import { commandExists } from '@/core/ai/cli';
import { SKILL_TARGET_BY_ID } from '@/config/ai-targets';

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
