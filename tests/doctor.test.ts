import { describe, expect, it } from 'vitest';
import { parseVersionDefault, runEnvironmentChecks, type ToolProbe } from '@/core/environment';
import type { EnvTool } from '@/config/environment-tools';

const tools: EnvTool[] = [
  { id: 'node', name: 'Node.js', bin: 'node', versionArgs: ['--version'], kind: 'runtime' },
  { id: 'docker', name: 'Docker', bin: 'docker', versionArgs: ['--version'], kind: 'container' },
];

describe('parseVersionDefault', () => {
  it('extracts semver from common --version output', () => {
    expect(parseVersionDefault('v22.17.1')).toBe('22.17.1');
    expect(parseVersionDefault('Docker version 24.0.5, build abc')).toBe('24.0.5');
    expect(parseVersionDefault('1.0.0-rc.2')).toBe('1.0.0-rc.2');
  });

  it('does not swallow trailing platform segments', () => {
    expect(parseVersionDefault('git version 2.45.1.windows.1')).toBe('2.45.1');
  });

  it('returns undefined when there is no version', () => {
    expect(parseVersionDefault('not recognized')).toBeUndefined();
  });
});

describe('runEnvironmentChecks', () => {
  it('uses the injected probe and preserves catalogue order', async () => {
    const probe: ToolProbe = async (tool) =>
      tool.id === 'node' ? { found: true, version: '20.0.0' } : { found: false };

    const checks = await runEnvironmentChecks(tools, probe);
    expect(checks.map((c) => c.id)).toEqual(['node', 'docker']);
    expect(checks[0]).toMatchObject({ found: true, version: '20.0.0', kind: 'runtime' });
    expect(checks[1]).toMatchObject({ found: false });
  });
});
