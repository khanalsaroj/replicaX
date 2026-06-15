import { describe, expect, it } from 'vitest';
import { computeChecksum, verifyChecksum } from '@/core/checksum';
import type { Tooling } from '@/schema';

const tooling: Tooling = {
  files: [
    {
      path: 'tsconfig.json',
      category: 'typescript',
      variant: 'json',
      encoding: 'utf8',
      content: '{}',
      bytes: 2,
    },
    {
      path: '.prettierrc',
      category: 'prettier',
      variant: 'other',
      encoding: 'utf8',
      content: 'x',
      bytes: 1,
    },
  ],
  packageJson: { scripts: { build: 'tsc' } },
};

describe('checksum', () => {
  it('computes a hash for each file plus the package.json template', () => {
    const sum = computeChecksum(tooling);
    expect(sum.algorithm).toBe('sha256');
    expect(Object.keys(sum.files).sort()).toEqual(['.prettierrc', 'package.json', 'tsconfig.json']);
  });

  it('reports no mismatches for intact tooling', () => {
    expect(verifyChecksum(tooling, computeChecksum(tooling))).toEqual([]);
  });

  it('detects altered, missing, and unexpected entries', () => {
    const stored = computeChecksum(tooling);
    const altered: Tooling = {
      ...tooling,
      files: [
        { ...tooling.files[0]!, content: 'CHANGED' },
        // .prettierrc removed → "missing" relative to stored
        {
          path: 'extra.json',
          category: 'misc',
          variant: 'json',
          encoding: 'utf8',
          content: 'y',
          bytes: 1,
        },
      ],
    };
    const reasons = verifyChecksum(altered, stored)
      .map((m) => `${m.reason}:${m.path}`)
      .sort();
    expect(reasons).toContain('altered:tsconfig.json');
    expect(reasons).toContain('missing:.prettierrc');
    expect(reasons).toContain('unexpected:extra.json');
  });
});
