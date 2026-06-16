import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import {
  detectFramework,
  detectLanguage,
  detectNodeVersion,
  detectPackageManager,
  type RawPackageJson,
} from '@/core/detect';
import { makeTempDir, writeFiles } from './helpers';

const pkg = (overrides: Partial<RawPackageJson>): RawPackageJson => ({ ...overrides });

describe('detectFramework', () => {
  it('returns "unknown" without a package.json and "node" for a plain package', () => {
    expect(detectFramework(null)).toBe('unknown');
    expect(detectFramework(pkg({}))).toBe('node');
  });

  it('detects frameworks from dependencies or devDependencies', () => {
    expect(detectFramework(pkg({ dependencies: { next: '14' } }))).toBe('next');
    expect(detectFramework(pkg({ devDependencies: { fastify: '4' } }))).toBe('fastify');
    expect(detectFramework(pkg({ dependencies: { vue: '3' } }))).toBe('vue');
    expect(detectFramework(pkg({ dependencies: { '@sveltejs/kit': '2' } }))).toBe('sveltekit');
  });

  it('prefers the more specific framework when several match', () => {
    // Next.js projects always depend on react — Next must win.
    expect(detectFramework(pkg({ dependencies: { next: '14', react: '18' } }))).toBe('next');
    // Expo / React Native projects also depend on react.
    expect(detectFramework(pkg({ dependencies: { expo: '51', react: '18' } }))).toBe('expo');
    expect(detectFramework(pkg({ dependencies: { 'react-native': '0.74', react: '18' } }))).toBe(
      'react-native',
    );
    // SvelteKit must win over plain svelte.
    expect(detectFramework(pkg({ dependencies: { '@sveltejs/kit': '2', svelte: '4' } }))).toBe(
      'sveltekit',
    );
  });
});

describe('filesystem-backed detectors', () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempDir();
  });
  afterEach(async () => {
    await fs.remove(root);
  });

  it('prefers the packageManager field over lockfiles', async () => {
    await writeFiles(root, { 'yarn.lock': '' });
    expect(await detectPackageManager(root, pkg({ packageManager: 'pnpm@9.0.0' }))).toBe('pnpm');
  });

  it('falls back to lockfiles, then to npm/unknown', async () => {
    await writeFiles(root, { 'pnpm-lock.yaml': '' });
    expect(await detectPackageManager(root, null)).toBe('pnpm');

    const empty = await makeTempDir();
    expect(await detectPackageManager(empty, pkg({}))).toBe('npm');
    expect(await detectPackageManager(empty, null)).toBe('unknown');
    await fs.remove(empty);
  });

  it('reads the Node version from .nvmrc before engines', async () => {
    await writeFiles(root, { '.nvmrc': '20.11.0\n' });
    expect(await detectNodeVersion(root, pkg({ engines: { node: '>=18' } }))).toBe('20.11.0');
  });

  it('treats a tsconfig or typescript dep as TypeScript', async () => {
    await writeFiles(root, { 'tsconfig.json': '{}' });
    expect(await detectLanguage(root, null)).toBe('typescript');
    expect(await detectLanguage(root, pkg({ devDependencies: { typescript: '5' } }))).toBe(
      'typescript',
    );

    const plain = await makeTempDir();
    expect(await detectLanguage(plain, pkg({}))).toBe('javascript');
    await fs.remove(plain);
  });
});
