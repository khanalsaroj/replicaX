import { REPLICAX_VERSION } from '@/constants';

/**
 * Profile schema migrations. The profile format is versioned by
 * `profile.replicaxVersion` ({@link REPLICAX_VERSION}); this module upgrades an
 * older profile's raw JSON to the current shape *before* it is zod-validated, so
 * we never break a profile written by an earlier ReplicaX.
 *
 * Today every change since 2.0.0 has been purely additive (new optional fields),
 * so the migrations are near-trivial — but the registry below is the seam where a
 * future non-trivial migration (a rename, a restructure) gets a home, applied in
 * order with no special-casing at the call site.
 */

/** Raw (un-validated) profile file objects, exactly as read from disk. */
export interface RawProfileFiles {
  profile: Record<string, unknown>;
  tooling: Record<string, unknown>;
  structure: Record<string, unknown>;
  metadata: Record<string, unknown>;
  checksum: Record<string, unknown>;
}

interface Migration {
  from: string;
  to: string;
  apply(raw: RawProfileFiles): RawProfileFiles;
}

/** Ordered chain of migrations. Each bridges exactly one version step. */
const MIGRATIONS: Migration[] = [
  {
    from: '2.0.0',
    to: '2.1.0',
    apply(raw) {
      // 2.1.0 only *adds* optional fields (metadata.detections, profile.registry,
      // manifest.json). Nothing in a 2.0.0 profile must change; we just ensure the
      // detections array exists so downstream code can treat it as always-present.
      const metadata = raw.metadata as Record<string, unknown> | undefined;
      if (metadata && typeof metadata === 'object' && !Array.isArray(metadata.detections)) {
        metadata.detections = [];
      }
      return raw;
    },
  },
  {
    from: '2.1.0',
    to: '2.2.0',
    apply(raw) {
      // 2.2.0 adds the optional `profile.source` provenance field. An older
      // profile simply lacks it; `create` treats an absent source as `local`
      // (trusted), so there is nothing to backfill.
      return raw;
    },
  },
];

/** The earliest version we know how to read, plus every version in the chain. */
const KNOWN_VERSIONS = new Set<string>([
  REPLICAX_VERSION,
  ...MIGRATIONS.flatMap((m) => [m.from, m.to]),
]);

/** Whether a given `replicaxVersion` is one this build understands. */
export function isKnownVersion(version: string): boolean {
  return KNOWN_VERSIONS.has(version);
}

export interface MigrationResult {
  raw: RawProfileFiles;
  /** Version detected on disk. */
  from: string;
  /** Version after migration (the current schema version when steps ran). */
  to: string;
  /** Whether any migration step was applied. */
  migrated: boolean;
  /** Human-readable description of each step applied, e.g. "2.0.0 → 2.1.0". */
  steps: string[];
}

/**
 * Walk the migration chain from `detectedVersion` toward {@link REPLICAX_VERSION},
 * mutating and returning the raw profile data. Unknown or newer-than-current
 * versions are returned untouched (the caller's zod parse remains the safety net).
 */
export function migrateRawBundle(raw: RawProfileFiles, detectedVersion: string): MigrationResult {
  const steps: string[] = [];
  let current = detectedVersion;
  let data = raw;

  // Apply each matching migration in sequence until none advances `current`.
  // Guard against cycles with a bounded loop (chain length is tiny).
  for (let guard = 0; guard < MIGRATIONS.length + 1; guard += 1) {
    if (current === REPLICAX_VERSION) break;
    const next = MIGRATIONS.find((m) => m.from === current);
    if (!next) break;
    data = next.apply(data);
    steps.push(`${next.from} → ${next.to}`);
    current = next.to;
  }

  return {
    raw: data,
    from: detectedVersion,
    to: current,
    migrated: steps.length > 0,
    steps,
  };
}
