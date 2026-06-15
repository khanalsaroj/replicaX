import { createHash } from 'node:crypto';
import type { Checksum, Tooling } from '@/schema';
import { canonicalPackageJson } from '@/core/package-template';

/** Logical key used in checksum.json for the curated package.json template. */
export const PACKAGE_JSON_KEY = 'package.json';

/** SHA-256 hex digest of a string. */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Compute integrity checksums for every captured artifact in a tooling set:
 * each verbatim file keyed by its path, plus the canonicalized package.json
 * template keyed by {@link PACKAGE_JSON_KEY}.
 */
export function computeChecksum(tooling: Tooling): Checksum {
  const files: Record<string, string> = {};
  for (const file of tooling.files) {
    files[file.path] = sha256(file.content);
  }
  if (tooling.packageJson) {
    files[PACKAGE_JSON_KEY] = sha256(canonicalPackageJson(tooling.packageJson));
  }
  return { algorithm: 'sha256', files };
}

export interface ChecksumMismatch {
  path: string;
  reason: 'missing' | 'altered' | 'unexpected';
}

/**
 * Verify a tooling set against a stored checksum manifest. Returns every
 * discrepancy found (empty array == intact).
 */
export function verifyChecksum(tooling: Tooling, stored: Checksum): ChecksumMismatch[] {
  const current = computeChecksum(tooling);
  const mismatches: ChecksumMismatch[] = [];

  for (const [key, hash] of Object.entries(stored.files)) {
    const actual = current.files[key];
    if (actual === undefined) {
      mismatches.push({ path: key, reason: 'missing' });
    } else if (actual !== hash) {
      mismatches.push({ path: key, reason: 'altered' });
    }
  }
  for (const key of Object.keys(current.files)) {
    if (!(key in stored.files)) {
      mismatches.push({ path: key, reason: 'unexpected' });
    }
  }
  return mismatches;
}
