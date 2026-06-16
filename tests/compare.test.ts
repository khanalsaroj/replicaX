import { describe, expect, it } from 'vitest';
import { buildBundle } from '@/core/profile-generator';
import { compareBundles, comparisonHasChanges } from '@/core/compare';
import type { Detection, Metadata, Structure, Tooling } from '@/schema';

function meta(over: Partial<Metadata> = {}): Metadata {
  return {
    nodeVersion: '20.x',
    packageManager: 'npm',
    framework: 'react',
    language: 'typescript',
    platform: 'linux',
    detections: [],
    ...over,
  };
}

function det(id: string, name: string, confidence = 1): Detection {
  return { id, name, category: 'test', confidence, evidence: [] };
}

function tooling(files: Array<[string, string]>): Tooling {
  return {
    files: files.map(([path, content]) => ({
      path,
      category: 'misc',
      variant: 'json',
      encoding: 'utf8',
      content,
      bytes: Buffer.byteLength(content),
    })),
  };
}

const structure = (directories: string[]): Structure => ({ root: 'x', directories });

const A = buildBundle({
  name: 'a',
  tooling: tooling([['eslint.config.js', 'export default [1]']]),
  structure: structure(['src']),
  metadata: meta({
    language: 'javascript',
    detections: [det('docker', 'Docker'), det('jest', 'Jest')],
  }),
});

const B = buildBundle({
  name: 'b',
  tooling: tooling([['eslint.config.js', 'export default [2]']]),
  structure: structure(['src', 'src/api']),
  metadata: meta({ detections: [det('docker', 'Docker'), det('vitest', 'Vitest')] }),
});

describe('compareBundles', () => {
  const cmp = compareBundles(A, B);
  const section = (id: string) => cmp.sections.find((s) => s.id === id)!;

  it('reports added/removed tooling by display name', () => {
    expect(section('tooling').added).toContain('Vitest');
    expect(section('tooling').removed).toContain('Jest');
  });

  it('reports changed config files by content hash', () => {
    expect(section('config-files').changed).toContain('eslint.config.js');
  });

  it('reports structure additions', () => {
    expect(section('structure').added).toContain('src/api');
  });

  it('reports metadata field changes as from → to', () => {
    expect(section('metadata').changed.some((s) => s.startsWith('language:'))).toBe(true);
  });

  it('flags that there are differences', () => {
    expect(comparisonHasChanges(cmp)).toBe(true);
  });

  it('finds no differences comparing a bundle to itself', () => {
    expect(comparisonHasChanges(compareBundles(A, A))).toBe(false);
  });
});
