import { describe, expect, it } from 'vitest';
import { buildManifest } from '@/core/manifest';
import { computeChecksum } from '@/core/checksum';
import { REPLICAX_VERSION } from '@/constants';
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

describe('buildManifest', () => {
  it('indexes files plus the package.json template with matching hashes', () => {
    const checksum = computeChecksum(tooling);
    const manifest = buildManifest(tooling, checksum);

    const paths = manifest.entries.map((e) => e.path);
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('package.json');

    const ts = manifest.entries.find((e) => e.path === 'tsconfig.json')!;
    expect(ts.sha256).toBe(checksum.files['tsconfig.json']);
    expect(ts.bytes).toBe(2);
    expect(manifest.schemaVersion).toBe(REPLICAX_VERSION);
  });

  it('sorts entries by path for stable output', () => {
    const checksum = computeChecksum(tooling);
    const manifest = buildManifest(tooling, checksum);
    const paths = manifest.entries.map((e) => e.path);
    expect(paths).toEqual([...paths].sort());
  });
});
