import { describe, expect, it } from 'vitest';
import { runAudit } from '@/core/audit/engine';
import type { AuditContext } from '@/core/audit/rules';
import type { Detection } from '@/schema';

function ctx(ids: string[]): AuditContext {
  const detections: Detection[] = ids.map((id) => ({
    id,
    name: id,
    category: 'test',
    confidence: 1,
    evidence: [],
  }));
  return {
    detections,
    metadata: {
      nodeVersion: '20.x',
      packageManager: 'npm',
      framework: 'react',
      language: 'typescript',
      platform: 'linux',
    },
    tooling: { files: [] },
  };
}

describe('runAudit', () => {
  it('scores 100 when every checked tool is present', () => {
    const all = [
      'eslint',
      'prettier',
      'vitest',
      'husky',
      'github-actions',
      'docker',
      'typescript',
      'commitlint',
      'lint-staged',
    ];
    expect(runAudit(ctx(all)).score).toBe(100);
  });

  it('scores 0 and recommends everything for an empty project', () => {
    const result = runAudit(ctx([]));
    expect(result.score).toBe(0);
    expect(result.missing).toContain('Linting');
    expect(result.recommendations).toHaveLength(result.rules.length);
  });

  it('weights testing and CI heavily (20 + 20 of 100)', () => {
    expect(runAudit(ctx(['vitest', 'github-actions'])).score).toBe(40);
  });

  it('marks passed rules and omits them from recommendations', () => {
    const result = runAudit(ctx(['eslint']));
    expect(result.rules.find((r) => r.id === 'linting')?.passed).toBe(true);
    expect(result.missing).not.toContain('Linting');
  });
});
