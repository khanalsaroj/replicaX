import { describe, expect, it } from 'vitest';
import { buildBundle } from '@/core/profile-generator';
import { decideInstall } from '@/commands/create';
import type { PackageManager, ProfileBundle, ProfileSource, Tooling } from '@/schema';

function bundleWith(opts: {
  source?: ProfileSource;
  devDeps?: Record<string, string>;
  manager?: PackageManager;
}): ProfileBundle {
  const tooling: Tooling = {
    files: [],
    packageJson: { devDependencies: opts.devDeps ?? {} },
  };
  return buildBundle({
    name: 'demo',
    tooling,
    structure: { root: 'demo', directories: [] },
    metadata: {
      nodeVersion: '20.x',
      packageManager: opts.manager ?? 'npm',
      framework: 'node',
      language: 'typescript',
      platform: 'linux',
    },
    ...(opts.source ? { source: opts.source } : {}),
  });
}

describe('buildBundle provenance', () => {
  it('stamps the given source', () => {
    expect(bundleWith({ source: 'github' }).profile.source).toBe('github');
  });

  it('omits source when none is given (legacy/local)', () => {
    expect(bundleWith({}).profile.source).toBeUndefined();
  });
});

describe('decideInstall trust gating', () => {
  const devDeps = { typescript: '^5.5.0', vitest: '^1.6.0' };

  it('installs a local profile by default', () => {
    const d = decideInstall(bundleWith({ source: 'local', devDeps }), {});
    expect(d.kind).toBe('install');
    expect(d).toMatchObject({ trusted: true });
  });

  it('treats a sourceless (legacy) profile as trusted-local', () => {
    expect(decideInstall(bundleWith({ devDeps }), {}).kind).toBe('install');
  });

  it('blocks an extracted (github) profile unless --install is passed', () => {
    expect(decideInstall(bundleWith({ source: 'github', devDeps }), {}).kind).toBe('blocked');
    const opted = decideInstall(bundleWith({ source: 'github', devDeps }), { install: true });
    expect(opted).toMatchObject({ kind: 'install', trusted: false });
  });

  it('blocks an imported profile unless --install is passed', () => {
    expect(decideInstall(bundleWith({ source: 'import', devDeps }), {}).kind).toBe('blocked');
    expect(decideInstall(bundleWith({ source: 'import', devDeps }), { install: true }).kind).toBe(
      'install',
    );
  });

  it('honours --skip-install over everything', () => {
    expect(
      decideInstall(bundleWith({ source: 'local', devDeps }), { skipInstall: true }).kind,
    ).toBe('skip-flag');
    expect(
      decideInstall(bundleWith({ source: 'github', devDeps }), {
        skipInstall: true,
        install: true,
      }).kind,
    ).toBe('skip-flag');
  });

  it('reports no-deps when there is nothing to install', () => {
    expect(decideInstall(bundleWith({ source: 'local', devDeps: {} }), {}).kind).toBe('no-deps');
  });

  it('reports no-manager when the package manager is unknown', () => {
    expect(
      decideInstall(bundleWith({ source: 'local', devDeps, manager: 'unknown' }), {}).kind,
    ).toBe('no-manager');
  });
});
