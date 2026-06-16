import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { isKnownVersion, migrateRawBundle, type RawProfileFiles } from '@/core/migrations';
import { loadBundle } from '@/core/profile-store';
import { REPLICAX_VERSION } from '@/constants';
import { makeTempDir } from './helpers';

function emptyRaw(metadata: Record<string, unknown> = {}): RawProfileFiles {
  return { profile: {}, tooling: {}, structure: {}, metadata, checksum: {} };
}

describe('migrateRawBundle', () => {
  it('fills detections when upgrading 2.0.0 → current', () => {
    const result = migrateRawBundle(emptyRaw(), '2.0.0');
    expect(result.migrated).toBe(true);
    expect(result.to).toBe(REPLICAX_VERSION);
    expect(result.raw.metadata.detections).toEqual([]);
  });

  it('is a no-op at the current version', () => {
    const result = migrateRawBundle(emptyRaw({ detections: [] }), REPLICAX_VERSION);
    expect(result.migrated).toBe(false);
    expect(result.steps).toHaveLength(0);
  });

  it('leaves an unknown/newer version untouched', () => {
    const result = migrateRawBundle(emptyRaw(), '99.0.0');
    expect(result.migrated).toBe(false);
  });

  it('knows its versions', () => {
    expect(isKnownVersion('2.0.0')).toBe(true);
    expect(isKnownVersion(REPLICAX_VERSION)).toBe(true);
    expect(isKnownVersion('0.0.0')).toBe(false);
  });
});

describe('loadBundle backward compatibility', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await fs.remove(dir);
  });

  it('loads a pre-2.1.0 profile (no detections, no manifest) and upgrades it in memory', async () => {
    // A genuine 2.0.0 profile: five files, no manifest.json, no detections.
    await fs.writeJson(path.join(dir, 'profile.json'), {
      name: 'legacy',
      version: '1.0.0',
      createdAt: '2025-01-01T00:00:00.000Z',
      replicaxVersion: '2.0.0',
    });
    await fs.writeJson(path.join(dir, 'tooling.json'), { files: [] });
    await fs.writeJson(path.join(dir, 'structure.json'), { root: 'legacy', directories: [] });
    await fs.writeJson(path.join(dir, 'metadata.json'), {
      nodeVersion: '18.x',
      packageManager: 'npm',
      framework: 'node',
      language: 'javascript',
      platform: 'linux',
    });
    await fs.writeJson(path.join(dir, 'checksum.json'), { algorithm: 'sha256', files: {} });

    const bundle = await loadBundle(dir);

    // Loads cleanly; the on-disk version is preserved (not rewritten on read).
    expect(bundle.profile.replicaxVersion).toBe('2.0.0');
    // Migration normalized detections; manifest was synthesized.
    expect(bundle.metadata.detections).toEqual([]);
    expect(bundle.manifest).toBeDefined();
    expect(bundle.manifest?.entries).toEqual([]);
  });
});
