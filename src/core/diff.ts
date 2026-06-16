import { PACKAGE_JSON_KEY } from '@/core/checksum';
import type { Checksum, Metadata, ProfileBundle, Structure } from '@/schema';

export interface ProfileDiff {
  files: { added: string[]; removed: string[]; changed: string[] };
  directories: { added: string[]; removed: string[] };
  packageJsonChanged: boolean;
  metadataChanges: Array<{ field: string; from: string; to: string }>;
}

/** Added/removed/changed keys between two string-valued maps. */
export interface MapDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

/**
 * Generic, sorted diff of two `key → value` maps: keys only in `next` are
 * "added", keys only in `prev` are "removed", shared keys with differing values
 * are "changed". Shared by the checksum diff here and the `compare` command's
 * config-file comparator, so both agree on what "changed" means.
 */
export function diffStringMaps(
  prev: Record<string, string>,
  next: Record<string, string>,
  options: { ignoreKeys?: ReadonlySet<string> } = {},
): MapDiff {
  const ignore = options.ignoreKeys;
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if (ignore?.has(key)) continue;
    const before = prev[key];
    const after = next[key];
    if (before === undefined) added.push(key);
    else if (after === undefined) removed.push(key);
    else if (before !== after) changed.push(key);
  }
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

const PACKAGE_JSON_KEYS = new Set([PACKAGE_JSON_KEY]);

function diffChecksums(prev: Checksum, next: Checksum) {
  const files = diffStringMaps(prev.files, next.files, { ignoreKeys: PACKAGE_JSON_KEYS });
  const packageJsonChanged = prev.files[PACKAGE_JSON_KEY] !== next.files[PACKAGE_JSON_KEY];
  return { files, packageJsonChanged };
}

function diffStructure(prev: Structure, next: Structure) {
  const before = new Set(prev.directories);
  const after = new Set(next.directories);
  const added = next.directories.filter((d) => !before.has(d));
  const removed = prev.directories.filter((d) => !after.has(d));
  return { added, removed };
}

function diffMetadata(prev: Metadata, next: Metadata) {
  const fields: Array<keyof Metadata> = [
    'nodeVersion',
    'packageManager',
    'framework',
    'language',
    'platform',
  ];
  const changes: Array<{ field: string; from: string; to: string }> = [];
  for (const field of fields) {
    if (prev[field] !== next[field]) {
      changes.push({ field, from: String(prev[field]), to: String(next[field]) });
    }
  }
  return changes;
}

/** Compute the difference between a previous and a freshly-scanned profile. */
export function diffBundles(prev: ProfileBundle, next: ProfileBundle): ProfileDiff {
  const checksums = diffChecksums(prev.checksum, next.checksum);
  return {
    files: checksums.files,
    packageJsonChanged: checksums.packageJsonChanged,
    directories: diffStructure(prev.structure, next.structure),
    metadataChanges: diffMetadata(prev.metadata, next.metadata),
  };
}

/** True when a diff contains any change at all. */
export function hasChanges(diff: ProfileDiff): boolean {
  return (
    diff.files.added.length > 0 ||
    diff.files.removed.length > 0 ||
    diff.files.changed.length > 0 ||
    diff.directories.added.length > 0 ||
    diff.directories.removed.length > 0 ||
    diff.packageJsonChanged ||
    diff.metadataChanges.length > 0
  );
}
