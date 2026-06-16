import { describe, expect, it } from 'vitest';
import { detectVariant, safeJoinable, toPosix } from '@/utils/paths';
import { renderTree } from '@/utils/tree';
import { formatBytes } from '@/utils/format';
import { slugify } from '@/utils/slug';

describe('paths', () => {
  it('normalizes Windows separators to POSIX', () => {
    expect(toPosix('a\\b\\c')).toBe('a/b/c');
  });

  it('classifies file variants by extension', () => {
    expect(detectVariant('vite.config.ts')).toBe('ts');
    expect(detectVariant('eslint.config.mjs')).toBe('mjs');
    expect(detectVariant('webpack.config.cjs')).toBe('cjs');
    expect(detectVariant('tsconfig.json')).toBe('json');
    expect(detectVariant('ci.yml')).toBe('yaml');
    expect(detectVariant('.prettierrc')).toBe('other');
    expect(detectVariant('Dockerfile')).toBe('other');
  });

  it('rejects path traversal and absolute paths', () => {
    expect(safeJoinable('src/components')).toBe('src/components');
    expect(safeJoinable('./foo')).toBe('foo');
    expect(safeJoinable('../escape')).toBeNull();
    expect(safeJoinable('a/../../b')).toBeNull();
    expect(safeJoinable('/etc/passwd')).toBeNull();
    expect(safeJoinable('C:/Windows')).toBeNull();
    expect(safeJoinable('')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formats sizes across unit thresholds', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('slugify', () => {
  it('produces safe kebab-case slugs with the default fallback', () => {
    expect(slugify('My Cool App')).toBe('my-cool-app');
    expect(slugify('  weird__Name!! ')).toBe('weird-name');
    expect(slugify('@scope/pkg')).toBe('scope-pkg');
    expect(slugify('***')).toBe('project');
  });

  it('honors a custom fallback when nothing usable remains', () => {
    expect(slugify('***', 'profile')).toBe('profile');
    expect(slugify('Already-Good', 'profile')).toBe('already-good');
  });
});

describe('renderTree', () => {
  it('renders a nested ASCII tree from directory paths', () => {
    const tree = renderTree(['src', 'src/components', 'src/hooks', '.github/workflows'], 'app');
    expect(tree).toContain('app/');
    expect(tree).toContain('└── src/');
    expect(tree).toContain('components/');
    expect(tree).toContain('workflows/');
  });
});
