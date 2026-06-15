import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { scanProject } from '@/core/scanner';
import { buildBundle } from '@/core/profile-generator';
import { loadBundle, profileDir, saveBundle } from '@/core/profile-store';
import { diffBundles, hasChanges } from '@/core/diff';
import { PROFILE_FILES } from '@/constants';
import { makeTempDir, scaffoldSampleProject } from './helpers';

let root: string;

beforeEach(async () => {
  root = await makeTempDir();
  await scaffoldSampleProject(root);
});

afterEach(async () => {
  await fs.remove(root);
});

async function bundleFor(name = 'sample') {
  const scan = await scanProject(root);
  return buildBundle({
    name,
    tooling: scan.tooling,
    structure: scan.structure,
    metadata: scan.metadata,
  });
}

describe('profile store', () => {
  it('round-trips a bundle through disk', async () => {
    const dir = profileDir(root);
    const bundle = await bundleFor();
    await saveBundle(dir, bundle);

    const loaded = await loadBundle(dir);
    expect(loaded.profile.name).toBe('sample');
    expect(loaded.tooling.files.length).toBe(bundle.tooling.files.length);
    expect(loaded.checksum.algorithm).toBe('sha256');
  });

  it('rejects a malformed profile file', async () => {
    const dir = profileDir(root);
    await saveBundle(dir, await bundleFor());
    await fs.writeFile(path.join(dir, PROFILE_FILES.metadata), '{ "language": 123 }', 'utf8');
    await expect(loadBundle(dir)).rejects.toThrow(/validation/i);
  });
});

describe('buildBundle on sync', () => {
  it('preserves identity and stamps updatedAt', async () => {
    const first = await bundleFor();
    const scan = await scanProject(root);
    const second = buildBundle({
      name: first.profile.name,
      tooling: scan.tooling,
      structure: scan.structure,
      metadata: scan.metadata,
      existing: first.profile,
    });
    expect(second.profile.createdAt).toBe(first.profile.createdAt);
    expect(second.profile.updatedAt).toBeDefined();
  });
});

describe('diffBundles', () => {
  it('detects an added file', async () => {
    const before = await bundleFor();
    await fs.writeFile(path.join(root, '.editorconfig'), 'root = true\n', 'utf8');
    const after = await bundleFor();

    const diff = diffBundles(before, after);
    expect(hasChanges(diff)).toBe(true);
    expect(diff.files.added).toContain('.editorconfig');
  });

  it('reports no changes for identical scans', async () => {
    const a = await bundleFor();
    const b = await bundleFor();
    expect(hasChanges(diffBundles(a, b))).toBe(false);
  });
});
