import { describe, expect, it } from 'vitest';
import {
  buildPackageTemplate,
  canonicalPackageJson,
  renderPackageJson,
} from '@/core/package-template';

const raw = {
  name: 'original',
  version: '1.2.3',
  type: 'module',
  packageManager: 'pnpm@9.0.0',
  engines: { node: '>=20' },
  scripts: { build: 'tsc', test: 'vitest' },
  dependencies: { react: '^18.0.0', lodash: '^4.0.0' },
  devDependencies: { typescript: '^5.5.0' },
  'lint-staged': { '*.ts': 'eslint --fix' },
};

describe('buildPackageTemplate', () => {
  it('keeps setup fields and drops runtime dependencies', () => {
    const template = buildPackageTemplate(raw)!;
    expect(template.scripts).toEqual(raw.scripts);
    expect(template.devDependencies).toEqual(raw.devDependencies);
    expect(template.engines).toEqual(raw.engines);
    expect(template.type).toBe('module');
    expect(template.packageManager).toBe('pnpm@9.0.0');
    expect(template.config?.['lint-staged']).toEqual(raw['lint-staged']);
    // The crucial guarantee:
    expect((template as Record<string, unknown>).dependencies).toBeUndefined();
  });

  it('returns undefined when there is no package.json', () => {
    expect(buildPackageTemplate(null)).toBeUndefined();
  });
});

describe('renderPackageJson', () => {
  it('stamps the new project name and omits dependencies', () => {
    const template = buildPackageTemplate(raw)!;
    const rendered = JSON.parse(renderPackageJson(template, 'my-new-app'));
    expect(rendered.name).toBe('my-new-app');
    expect(rendered.version).toBe('0.1.0');
    expect(rendered.dependencies).toBeUndefined();
    expect(rendered.devDependencies).toEqual(raw.devDependencies);
    expect(rendered['lint-staged']).toEqual(raw['lint-staged']);
  });
});

describe('canonicalPackageJson', () => {
  it('is stable regardless of key order', () => {
    const a = canonicalPackageJson({ scripts: { b: '1', a: '2' }, type: 'module' });
    const b = canonicalPackageJson({ type: 'module', scripts: { a: '2', b: '1' } });
    expect(a).toBe(b);
  });
});
