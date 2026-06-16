import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { scanProject } from '@/core/scanner';
import { buildSkill } from '@/core/skill-generator';
import { slugify } from '@/utils/slug';
import { SKILL_TARGET_BY_ID } from '@/config/ai-targets';
import { makeTempDir, scaffoldSampleProject } from './helpers';

let root: string;

beforeEach(async () => {
  root = await makeTempDir();
  await scaffoldSampleProject(root);
});

afterEach(async () => {
  await fs.remove(root);
});

describe('slugify', () => {
  it('produces a safe kebab-case slug', () => {
    expect(slugify('My Cool App')).toBe('my-cool-app');
    expect(slugify('  weird__Name!! ')).toBe('weird-name');
    expect(slugify('@scope/pkg')).toBe('scope-pkg');
    expect(slugify('***')).toBe('project');
  });
});

describe('buildSkill', () => {
  it('renders YAML frontmatter with the slug and a description', async () => {
    const scan = await scanProject(root);
    const skill = buildSkill({
      name: 'Sample App',
      metadata: scan.metadata,
      tooling: scan.tooling,
      structure: scan.structure,
      pkg: scan.pkg,
    });

    expect(skill.slug).toBe('sample-app');
    expect(skill.content.startsWith('---\n')).toBe(true);
    expect(skill.content).toContain('name: sample-app');
    expect(skill.content).toMatch(/description: ".*"/);
    // Frontmatter is closed.
    expect(skill.content.split('---').length).toBeGreaterThanOrEqual(3);
  });

  it('summarizes the detected tech stack and install command', async () => {
    const scan = await scanProject(root);
    const { content } = buildSkill({
      name: 'sample',
      metadata: scan.metadata,
      tooling: scan.tooling,
      structure: scan.structure,
      pkg: scan.pkg,
    });

    expect(content).toContain('**Language:** TypeScript');
    expect(content).toContain('**Framework:** React');
    expect(content).toContain('**Package manager:** pnpm');
    // pnpm install command, not npm.
    expect(content).toContain('pnpm install');
  });

  it('lists package.json scripts as package-manager commands', async () => {
    const scan = await scanProject(root);
    const { content } = buildSkill({
      name: 'sample',
      metadata: scan.metadata,
      tooling: scan.tooling,
      structure: scan.structure,
      pkg: scan.pkg,
    });

    expect(content).toContain('**build** — `pnpm build`');
    expect(content).toContain('**test** — `pnpm test`');
  });

  it('groups captured tooling and lists top-level structure', async () => {
    const scan = await scanProject(root);
    const { content } = buildSkill({
      name: 'sample',
      metadata: scan.metadata,
      tooling: scan.tooling,
      structure: scan.structure,
      pkg: scan.pkg,
    });

    expect(content).toContain('## Tooling');
    expect(content).toContain('Docker');
    expect(content).toContain('## Project structure');
    expect(content).toContain('- `src/`');
  });

  it('derives conventions from the detected tooling', async () => {
    const scan = await scanProject(root);
    const { content } = buildSkill({
      name: 'sample',
      metadata: scan.metadata,
      tooling: scan.tooling,
      structure: scan.structure,
      pkg: scan.pkg,
    });

    expect(content).toContain('## Conventions');
    expect(content).toContain('TypeScript');
    expect(content).toContain('Prettier');
    expect(content).toContain('Vitest');
  });

  it('handles a project with no package.json', async () => {
    await fs.remove(`${root}/package.json`);
    const scan = await scanProject(root);
    const { content } = buildSkill({
      name: 'bare',
      metadata: scan.metadata,
      tooling: scan.tooling,
      structure: scan.structure,
      pkg: scan.pkg,
    });

    // Still renders the document; no Commands section without scripts.
    expect(content).toContain('# bare');
    expect(content).not.toContain('## Commands');
  });
});

describe('skill targets', () => {
  it('maps each target to its on-disk skill path', () => {
    expect(SKILL_TARGET_BY_ID.get('claude')?.entryPath('my-app')).toBe(
      '.claude/skills/my-app/SKILL.md',
    );
    expect(SKILL_TARGET_BY_ID.get('codex')?.entryPath('my-app')).toBe(
      '.codex/skills/my-app/SKILL.md',
    );
    expect(SKILL_TARGET_BY_ID.get('antigravity')?.entryPath('my-app')).toBe(
      '.agents/skills/my-app.md',
    );
  });
});
