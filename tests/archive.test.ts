import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { scanProject } from '@/core/scanner';
import { buildBundle } from '@/core/profile-generator';
import { loadBundle, profileDir, saveBundle } from '@/core/profile-store';
import { exportProfile, extractToTemp, findProfileRoot } from '@/core/archive';
import { makeTempDir, scaffoldSampleProject } from './helpers';

let root: string;

beforeEach(async () => {
  root = await makeTempDir('replicax-archive-');
  await scaffoldSampleProject(root);
});

afterEach(async () => {
  await fs.remove(root);
});

describe('archive export/import', () => {
  it('round-trips a profile through a tar.gz archive', async () => {
    const dir = profileDir(root);
    const scan = await scanProject(root);
    const bundle = buildBundle({
      name: 'archived',
      tooling: scan.tooling,
      structure: scan.structure,
      metadata: scan.metadata,
    });
    await saveBundle(dir, bundle);

    const out = path.join(root, 'profile.tar.gz');
    await exportProfile(dir, out);
    expect((await fs.stat(out)).size).toBeGreaterThan(0);

    const tmp = await extractToTemp(out);
    const found = await findProfileRoot(tmp);
    expect(found).not.toBeNull();

    const reloaded = await loadBundle(found!);
    expect(reloaded.profile.name).toBe('archived');
    expect(reloaded.tooling.files.length).toBe(bundle.tooling.files.length);

    await fs.remove(tmp);
  });
});
