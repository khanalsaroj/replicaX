import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { scanProject } from '@/core/scanner';
import { makeTempDir, writeFiles } from './helpers';

let root: string;

beforeEach(async () => {
  root = await makeTempDir();
});

afterEach(async () => {
  await fs.remove(root);
});

describe('.replicaxinclude', () => {
  it('additively captures files the catalogue does not know about', async () => {
    await writeFiles(root, {
      'package.json': '{"name":"x"}',
      'app.config.toml': 'key = "value"\n',
      'config/custom.json': '{"a":1}\n',
      '.replicaxinclude': '# extra setup files\napp.config.toml\nconfig/**\n',
    });

    const { tooling } = await scanProject(root);
    const paths = tooling.files.map((f) => f.path);

    expect(paths).toContain('app.config.toml');
    expect(paths).toContain('config/custom.json');
    const toml = tooling.files.find((f) => f.path === 'app.config.toml');
    expect(toml?.category).toBe('included');
    expect(toml?.content).toContain('key = "value"');
  });

  it('lets .replicaxignore override an include (ignore wins)', async () => {
    await writeFiles(root, {
      'keep.toml': 'a=1\n',
      'drop.toml': 'b=2\n',
      '.replicaxinclude': '*.toml\n',
      '.replicaxignore': 'drop.toml\n',
    });

    const { tooling } = await scanProject(root);
    const paths = tooling.files.map((f) => f.path);

    expect(paths).toContain('keep.toml');
    expect(paths).not.toContain('drop.toml');
  });

  it('never lets an include capture a secret (secret guard wins)', async () => {
    await writeFiles(root, {
      '.env': 'API_KEY=secret\n',
      'private.key': 'PRIVATE\n',
      '.replicaxinclude': '.env\nprivate.key\n',
    });

    const { tooling, skippedSecrets } = await scanProject(root);
    const paths = tooling.files.map((f) => f.path);

    expect(paths).not.toContain('.env');
    expect(paths).not.toContain('private.key');
    expect(skippedSecrets).toEqual(expect.arrayContaining(['.env', 'private.key']));
  });

  it('can include a file in a normally-pruned location (overrides defaults)', async () => {
    await writeFiles(root, {
      '.vscode/extensions.json': '{"recommendations":[]}\n',
      '.replicaxinclude': '.vscode/extensions.json\n',
    });

    const { tooling } = await scanProject(root);
    expect(tooling.files.map((f) => f.path)).toContain('.vscode/extensions.json');
  });

  it('is a no-op when no .replicaxinclude exists', async () => {
    await writeFiles(root, {
      'package.json': '{"name":"x"}',
      'tsconfig.json': '{}\n',
      'app.config.toml': 'k=1\n',
    });

    const { tooling } = await scanProject(root);
    const paths = tooling.files.map((f) => f.path);
    expect(paths).toContain('tsconfig.json'); // catalogue still works
    expect(paths).not.toContain('app.config.toml'); // not captured without include
  });
});
