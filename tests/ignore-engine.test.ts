import { describe, expect, it } from 'vitest';
import { IgnoreEngine } from '@/core/ignore-engine';

describe('IgnoreEngine', () => {
  it('applies default ignores for build output and dependencies', () => {
    const ig = new IgnoreEngine();
    expect(ig.isIgnored('node_modules/react/index.js')).toBe(true);
    expect(ig.isIgnored('dist/bundle.js')).toBe(true);
    expect(ig.isIgnored('.husky/_/husky.sh')).toBe(true);
    expect(ig.isIgnored('src/components/Button.tsx')).toBe(false);
  });

  it('ignores IDE / editor folders so they are never replicated', () => {
    const ig = new IgnoreEngine();
    expect(ig.isIgnored('.vscode/settings.json')).toBe(true);
    expect(ig.isIgnored('.idea/workspace.xml')).toBe(true);
    expect(ig.isIgnored('.vs/ProjectSettings.json')).toBe(true);
    expect(ig.isIgnored('.fleet/settings.json')).toBe(true);
    expect(ig.isIgnored('.zed/settings.json')).toBe(true);
    // .editorconfig is portable (cross-editor), not IDE-specific — still kept.
    expect(ig.isIgnored('.editorconfig')).toBe(false);
  });

  it('keeps directories whose contents are ignored', () => {
    const ig = new IgnoreEngine(['src/services/**']);
    // The dir itself survives; only its contents are ignored.
    expect(ig.isIgnored('src/services')).toBe(false);
    expect(ig.isIgnored('src/services/UserService.ts')).toBe(true);
  });

  it('honors user patterns from .replicaxignore', () => {
    const ig = new IgnoreEngine(['*.log', '# a comment', '', 'tmp/']);
    expect(ig.isIgnored('debug.log')).toBe(true);
    expect(ig.isIgnored('tmp/cache')).toBe(true);
    expect(ig.userPatterns).toEqual(['*.log', 'tmp/']);
  });

  it('treats secrets as protected regardless of ignore config', () => {
    const ig = new IgnoreEngine();
    expect(ig.isSecret('.env')).toBe(true);
    expect(ig.isSecret('.env.production')).toBe(true);
    expect(ig.isSecret('config/private.pem')).toBe(true);
    expect(ig.isSecret('certs/server.key')).toBe(true);
    expect(ig.isSecret('id_rsa')).toBe(true);
    expect(ig.isSecret('tsconfig.json')).toBe(false);
  });
});
