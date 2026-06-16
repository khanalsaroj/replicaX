import { REPLICAX_VERSION } from '@/constants';
import type { Checksum, Manifest, ManifestEntry, Tooling } from '@/schema';
import { PACKAGE_JSON_KEY } from '@/core/checksum';

/**
 * Build the lightweight file manifest (`manifest.json`) — a content-free index
 * of every captured artifact: its path, category, variant, size, and hash. It is
 * fully derived from {@link Tooling} plus the already-computed {@link Checksum}
 * map, so it never re-reads or re-hashes anything.
 *
 * The manifest is what `compare` and a future registry can read to reason about a
 * profile's contents without loading the (potentially large) verbatim file bodies
 * in `tooling.json`.
 */
export function buildManifest(tooling: Tooling, checksum: Checksum): Manifest {
  const entries: ManifestEntry[] = tooling.files.map((file) => ({
    path: file.path,
    category: file.category,
    variant: file.variant,
    bytes: file.bytes,
    sha256: checksum.files[file.path] ?? '',
  }));

  if (tooling.packageJson) {
    entries.push({
      path: PACKAGE_JSON_KEY,
      category: 'package',
      variant: 'json',
      // The curated template is a derived artifact, not a captured file on disk,
      // so byte size is not meaningful — recorded as 0.
      bytes: 0,
      sha256: checksum.files[PACKAGE_JSON_KEY] ?? '',
    });
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));

  return {
    schemaVersion: REPLICAX_VERSION,
    generatedAt: new Date().toISOString(),
    entries,
  };
}
