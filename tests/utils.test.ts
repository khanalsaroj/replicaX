import { describe, expect, it } from 'vitest';
import { detectVariant, safeJoinable, toPosix } from '@/utils/paths';
import { renderTree } from '@/utils/tree';

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

describe('renderTree', () => {
  it('renders a nested ASCII tree from directory paths', () => {
    const tree = renderTree(['src', 'src/components', 'src/hooks', '.github/workflows'], 'app');
    expect(tree).toContain('app/');
    expect(tree).toContain('└── src/');
    expect(tree).toContain('components/');
    expect(tree).toContain('workflows/');
  });
});
