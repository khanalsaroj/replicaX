import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { runDetectors } from '@/core/detection/registry';
import { metadataDetections } from '@/core/detection/detectors/languages';
import type { DetectionContext } from '@/core/detection/types';
import type { RawPackageJson } from '@/core/detect';
import type { Detection, Metadata } from '@/schema';
import { scanProject } from '@/core/scanner';
import { makeTempDir, scaffoldSampleProject, writeFiles } from './helpers';

/** Build a pure DetectionContext literal for unit-testing detectors (no IO). */
function makeCtx(
  present: string[],
  opts: { pkg?: RawPackageJson | null; deps?: Record<string, string> } = {},
): DetectionContext {
  const set = new Set(present);
  const deps = opts.deps ?? {};
  return {
    root: '/project',
    pkg: opts.pkg ?? null,
    deps,
    present: set,
    has: (rel) => set.has(rel),
    hasUnder: (prefix) => {
      const p = prefix.replace(/\/+$/, '');
      return set.has(p) || [...set].some((s) => s.startsWith(`${p}/`));
    },
    hasDep: (name) => name in deps,
  };
}

const ids = (list: Detection[]): string[] => list.map((d) => d.id);
const byId = (list: Detection[], id: string): Detection | undefined =>
  list.find((d) => d.id === id);

describe('detectors (pure context)', () => {
  it('detects package managers from lockfiles with full confidence', () => {
    expect(byId(runDetectors(makeCtx(['package-lock.json'])), 'npm')?.confidence).toBe(1);
    expect(byId(runDetectors(makeCtx(['pnpm-lock.yaml'])), 'pnpm')?.confidence).toBe(1);
    expect(byId(runDetectors(makeCtx(['yarn.lock'])), 'yarn')?.confidence).toBe(1);
    expect(byId(runDetectors(makeCtx(['bun.lockb'])), 'bun')?.confidence).toBe(1);
  });

  it('falls back to the packageManager field with lower confidence', () => {
    const ctx = makeCtx([], { pkg: { packageManager: 'pnpm@9.0.0' } });
    const pnpm = byId(runDetectors(ctx), 'pnpm');
    expect(pnpm?.confidence).toBe(0.9);
  });

  it('grades Docker by evidence strength', () => {
    expect(byId(runDetectors(makeCtx(['Dockerfile'])), 'docker')?.confidence).toBe(1);
    const ignoreOnly = byId(runDetectors(makeCtx(['.dockerignore'])), 'docker');
    expect(ignoreOnly?.confidence).toBe(0.7);
  });

  it('detects compose, CI, hooks and monorepo tools', () => {
    expect(ids(runDetectors(makeCtx(['compose.yaml'])))).toContain('docker-compose');
    expect(ids(runDetectors(makeCtx(['.github/workflows/ci.yml'])))).toContain('github-actions');
    expect(ids(runDetectors(makeCtx(['.gitlab-ci.yml'])))).toContain('gitlab-ci');
    expect(ids(runDetectors(makeCtx(['.husky/pre-commit'])))).toContain('husky');
    expect(ids(runDetectors(makeCtx(['turbo.json'])))).toContain('turborepo');
    expect(ids(runDetectors(makeCtx(['nx.json'])))).toContain('nx');
  });

  it('detects commit tooling from config files or package.json blocks', () => {
    expect(ids(runDetectors(makeCtx(['commitlint.config.js'])))).toContain('commitlint');
    const pkgBlock = makeCtx([], { pkg: { 'lint-staged': { '*.ts': 'eslint' } } });
    expect(ids(runDetectors(pkgBlock))).toContain('lint-staged');
  });

  it('detects lint/format from config or dependency', () => {
    expect(byId(runDetectors(makeCtx(['eslint.config.js'])), 'eslint')?.confidence).toBe(1);
    const depOnly = makeCtx([], { deps: { eslint: '^9' } });
    expect(byId(runDetectors(depOnly), 'eslint')?.confidence).toBe(0.9);
    expect(ids(runDetectors(makeCtx(['.prettierrc'])))).toContain('prettier');
  });

  it('detects editors and AI assistants', () => {
    expect(ids(runDetectors(makeCtx(['.vscode/settings.json'])))).toContain('vscode');
    expect(ids(runDetectors(makeCtx(['.cursorrules'])))).toContain('cursor');
    expect(ids(runDetectors(makeCtx(['CLAUDE.md'])))).toContain('claude-code');
    expect(ids(runDetectors(makeCtx(['.windsurfrules'])))).toContain('windsurf');
    expect(ids(runDetectors(makeCtx(['.devcontainer/devcontainer.json'])))).toContain(
      'devcontainer',
    );
  });

  it('detects the JVM stack from build files and resources', () => {
    expect(ids(runDetectors(makeCtx(['pom.xml'])))).toContain('maven');
    expect(ids(runDetectors(makeCtx(['build.gradle.kts'])))).toContain('gradle');
    const spring = makeCtx(['pom.xml', 'src/main/resources/application.yml']);
    expect(byId(runDetectors(spring), 'spring-boot')?.confidence).toBe(0.9);
  });

  it('returns nothing for an empty project', () => {
    expect(runDetectors(makeCtx([]))).toHaveLength(0);
  });
});

describe('metadataDetections', () => {
  const base: Metadata = {
    nodeVersion: '20.x',
    packageManager: 'npm',
    framework: 'react',
    language: 'typescript',
    platform: 'linux',
  };

  it('emits language and framework chips', () => {
    const list = metadataDetections(base);
    expect(byId(list, 'typescript')?.name).toBe('TypeScript');
    expect(byId(list, 'react')?.name).toBe('React');
  });

  it('skips noise frameworks and unknown language', () => {
    const list = metadataDetections({ ...base, framework: 'node', language: 'unknown' });
    expect(list).toHaveLength(0);
  });
});

describe('detectStack via scanProject', () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempDir();
    await scaffoldSampleProject(root);
  });
  afterEach(async () => {
    await fs.remove(root);
  });

  it('detects the sample project stack and stores it in metadata', async () => {
    const scan = await scanProject(root);
    const found = ids(scan.detections);
    expect(found).toEqual(
      expect.arrayContaining([
        'typescript',
        'react',
        'docker',
        'github-actions',
        'husky',
        'eslint',
        'prettier',
      ]),
    );
    // detections are mirrored into metadata for persistence
    expect(scan.metadata.detections).toEqual(scan.detections);
  });

  it('detects a Spring Boot project that has no package.json', async () => {
    const jvm = await makeTempDir();
    await writeFiles(jvm, {
      'pom.xml': '<project><groupId>demo</groupId></project>\n',
      'src/main/resources/application.yml': 'server:\n  port: 8080\n',
    });
    const scan = await scanProject(jvm);
    expect(ids(scan.detections)).toEqual(expect.arrayContaining(['maven', 'spring-boot']));
    await fs.remove(jvm);
  });
});
