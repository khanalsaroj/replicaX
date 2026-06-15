import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { scanProject } from '@/core/scanner';
import { buildBundle } from '@/core/profile-generator';
import { generateProject } from '@/core/project-generator';
import { ConflictResolver } from '@/core/conflict-resolver';
import type { ProfileBundle } from '@/schema';
import { makeTempDir, scaffoldSampleProject } from './helpers';

let source: string;
let bundle: ProfileBundle;

beforeEach(async () => {
  source = await makeTempDir('replicax-src-');
  await scaffoldSampleProject(source);
  const scan = await scanProject(source);
  bundle = buildBundle({
    name: 'sample',
    tooling: scan.tooling,
    structure: scan.structure,
    metadata: scan.metadata,
  });
});

afterEach(async () => {
  await fs.remove(source);
});

describe('generateProject', () => {
  it('recreates config files and directory structure, but not business code', async () => {
    const target = path.join(await makeTempDir('replicax-out-'), 'app');
    await generateProject({
      bundle,
      targetDir: target,
      projectName: 'app',
      dryRun: false,
      conflict: new ConflictResolver('overwrite'),
    });

    expect(await fs.pathExists(path.join(target, 'tsconfig.json'))).toBe(true);
    expect(await fs.pathExists(path.join(target, 'vite.config.ts'))).toBe(true);
    // Directory is recreated…
    expect(await fs.pathExists(path.join(target, 'src/components'))).toBe(true);
    // …but the business file inside it is not.
    expect(await fs.pathExists(path.join(target, 'src/components/Button.tsx'))).toBe(false);
    expect(await fs.pathExists(path.join(target, '.env'))).toBe(false);

    const pkg = await fs.readJson(path.join(target, 'package.json'));
    expect(pkg.name).toBe('app');
    expect(pkg.dependencies).toBeUndefined();

    await fs.remove(path.dirname(target));
  });

  it('writes nothing in dry-run mode', async () => {
    const target = path.join(await makeTempDir('replicax-dry-'), 'app');
    const result = await generateProject({
      bundle,
      targetDir: target,
      projectName: 'app',
      dryRun: true,
      conflict: new ConflictResolver('overwrite'),
    });
    expect(result.filesWritten).toBeGreaterThan(0);
    expect(await fs.pathExists(target)).toBe(false);
    await fs.remove(path.dirname(target));
  });

  it('skips existing files under the skip policy', async () => {
    const base = await makeTempDir('replicax-conflict-');
    const target = path.join(base, 'app');
    await fs.ensureDir(target);
    await fs.writeFile(path.join(target, 'tsconfig.json'), 'PRESERVE ME', 'utf8');

    const result = await generateProject({
      bundle,
      targetDir: target,
      projectName: 'app',
      dryRun: false,
      conflict: new ConflictResolver('skip'),
    });

    expect(result.filesSkipped).toBeGreaterThan(0);
    expect(await fs.readFile(path.join(target, 'tsconfig.json'), 'utf8')).toBe('PRESERVE ME');
    await fs.remove(base);
  });
});
