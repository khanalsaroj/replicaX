import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { scanProject, sanitizeNpmrc } from '@/core/scanner';
import { makeTempDir, scaffoldSampleProject, writeFiles } from './helpers';

let root: string;

beforeEach(async () => {
  root = await makeTempDir();
  await scaffoldSampleProject(root);
});

afterEach(async () => {
  await fs.remove(root);
});

describe('sanitizeNpmrc', () => {
  it('strips credential lines but keeps settings', () => {
    const cleaned = sanitizeNpmrc(
      'save-exact=true\n//registry/:_authToken=abc\nengine-strict=true\n',
    );
    expect(cleaned).toContain('save-exact=true');
    expect(cleaned).toContain('engine-strict=true');
    expect(cleaned).not.toContain('_authToken');
    expect(cleaned).not.toContain('abc');
  });
});

describe('scanProject', () => {
  it('captures supported config files', async () => {
    const { tooling } = await scanProject(root);
    const paths = tooling.files.map((f) => f.path).sort();
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('vite.config.ts');
    expect(paths).toContain('.github/workflows/ci.yml');
    expect(paths).toContain('.husky/pre-commit');
  });

  it('never captures secrets or runtime source files', async () => {
    const { tooling } = await scanProject(root);
    const paths = tooling.files.map((f) => f.path);
    // .env / .pem don't match any config glob, so they're never even read.
    expect(paths).not.toContain('.env');
    expect(paths).not.toContain('private.pem');
    expect(paths).not.toContain('src/components/Button.tsx');
  });

  it('blocks (and reports) a secret that happens to match a config glob', async () => {
    // `eslint.config.key` matches the eslint glob but is caught by the guard.
    await fs.writeFile(path.join(root, 'eslint.config.key'), 'secret-material', 'utf8');
    const { tooling, skippedSecrets } = await scanProject(root);
    expect(tooling.files.map((f) => f.path)).not.toContain('eslint.config.key');
    expect(skippedSecrets).toContain('eslint.config.key');
  });

  it('never captures IDE config or IDE folders', async () => {
    await fs.writeFile(path.join(root, '.editorconfig'), 'root = true\n', 'utf8');
    await writeFiles(root, {
      '.vscode/settings.json': '{ "editor.tabSize": 2 }\n',
      '.idea/workspace.xml': '<project/>\n',
    });

    const { tooling, structure } = await scanProject(root);
    const paths = tooling.files.map((f) => f.path);

    // Portable .editorconfig is still captured; IDE-specific config is not.
    expect(paths).toContain('.editorconfig');
    expect(paths).not.toContain('.vscode/settings.json');
    // IDE folders don't leak into the reproduced directory structure either.
    expect(structure.directories).not.toContain('.vscode');
    expect(structure.directories).not.toContain('.idea');
  });

  it('sanitizes a captured .npmrc', async () => {
    const { tooling } = await scanProject(root);
    const npmrc = tooling.files.find((f) => f.path === '.npmrc');
    expect(npmrc?.content).not.toContain('SECRET123');
  });

  it('builds a curated package.json template without dependencies', async () => {
    const { tooling } = await scanProject(root);
    expect(tooling.packageJson?.devDependencies).toBeDefined();
    expect((tooling.packageJson as Record<string, unknown>)?.dependencies).toBeUndefined();
  });

  it('captures directory structure but prunes node_modules and dist', async () => {
    const { structure } = await scanProject(root);
    expect(structure.directories).toContain('src/components');
    expect(structure.directories).toContain('src/services');
    expect(structure.directories.some((d) => d.startsWith('node_modules'))).toBe(false);
    expect(structure.directories).not.toContain('dist');
  });

  it('infers project metadata', async () => {
    const { metadata } = await scanProject(root);
    expect(metadata.language).toBe('typescript');
    expect(metadata.framework).toBe('react');
    expect(metadata.packageManager).toBe('pnpm');
    expect(metadata.nodeVersion).toBe('20.11.0');
  });
});
