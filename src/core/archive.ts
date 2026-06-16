import { createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { create as tarCreate, extract as tarExtract, Parser, type ReadEntry } from 'tar';
import { PROFILE_FILES } from '@/constants';
import { ReplicaxError } from '@/utils/errors';
import { safeJoinable } from '@/utils/paths';

/**
 * Pack a `.replicax` directory into a gzipped tar archive. The archive always
 * stores the profile under its directory name so it round-trips cleanly.
 */
export async function exportProfile(profileDirectory: string, outPath: string): Promise<void> {
  const resolvedOut = path.resolve(outPath);
  await fs.ensureDir(path.dirname(resolvedOut));

  const parent = path.dirname(profileDirectory);
  const base = path.basename(profileDirectory);

  await tarCreate(
    {
      gzip: true,
      file: resolvedOut,
      cwd: parent,
      // tar strips leading "/" and ".." by default, so extraction stays scoped.
      portable: true,
    },
    [base],
  );
}

/**
 * Limits enforced when extracting an untrusted archive. Tar extraction is a
 * trust boundary — a hostile `.tar.gz` can attempt path traversal, symlink
 * escapes, or a decompression bomb — so every archive is validated against
 * these bounds *before* a single byte is written to disk.
 */
export interface ArchiveLimits {
  /** Maximum size of the on-disk (compressed) archive, in bytes. */
  maxCompressedBytes: number;
  /** Maximum total uncompressed size across all entries, in bytes. */
  maxTotalBytes: number;
  /** Maximum number of file/directory entries. */
  maxEntries: number;
  /** Maximum size of any single entry, in bytes. */
  maxEntryBytes: number;
  /**
   * How to treat symlink/hardlink entries. `false` → a link is a hard error
   * (used for untrusted profile archives, which never need links). `true` →
   * links are silently skipped, not extracted (used for GitHub repo tarballs,
   * which legitimately contain links the scanner never follows).
   */
  allowSymlinks: boolean;
}

/** Bounds for an imported profile `.tar.gz` — small, link-free, strictly capped. */
export const PROFILE_ARCHIVE_LIMITS: ArchiveLimits = {
  maxCompressedBytes: 50 * 1024 * 1024, // 50 MB
  maxTotalBytes: 200 * 1024 * 1024, // 200 MB uncompressed
  maxEntries: 20_000,
  maxEntryBytes: 50 * 1024 * 1024, // 50 MB per file
  allowSymlinks: false,
};

/** Bounds for a downloaded GitHub repo tarball — larger, links tolerated (skipped). */
export const REPO_ARCHIVE_LIMITS: ArchiveLimits = {
  maxCompressedBytes: 250 * 1024 * 1024, // 250 MB
  maxTotalBytes: 1024 * 1024 * 1024, // 1 GB uncompressed
  maxEntries: 200_000,
  maxEntryBytes: 200 * 1024 * 1024, // 200 MB per file
  allowSymlinks: true,
};

type Verdict = 'extract' | 'skip';

/**
 * Decide whether a single tar entry is safe to extract. Throws a hard error for
 * anything dangerous (path traversal, an oversized file, a device/FIFO entry,
 * or — when `allowSymlinks` is false — a link). Returns `'skip'` for links that
 * are tolerated-but-not-extracted, `'extract'` for ordinary files/dirs.
 */
function inspectEntry(entry: ReadEntry, limits: ArchiveLimits): Verdict {
  const type = String(entry.type);
  const entryPath = entry.path;

  if (type === 'File' || type === 'Directory' || type === 'GNUDumpDir') {
    if (safeJoinable(entryPath) === null) {
      throw new ReplicaxError(`Refusing to extract unsafe path from archive: "${entryPath}".`, [
        'The archive may be malicious (path traversal).',
      ]);
    }
    if ((entry.size ?? 0) > limits.maxEntryBytes) {
      throw new ReplicaxError(`Archive entry "${entryPath}" exceeds the per-file size limit.`);
    }
    return 'extract';
  }

  if (type === 'SymbolicLink' || type === 'Link') {
    if (!limits.allowSymlinks) {
      throw new ReplicaxError(`Refusing to extract link entry from archive: "${entryPath}".`, [
        'Profile archives never contain symlinks; this one may be malicious.',
      ]);
    }
    return 'skip';
  }

  // Block devices, character devices, FIFOs, etc. are never legitimate here.
  throw new ReplicaxError(`Refusing to extract "${entryPath}" (unsupported tar entry: ${type}).`);
}

/**
 * Validate an archive's contents without writing anything, enforcing every
 * limit. Drives the tar `Parser` manually (rather than the high-level `list`,
 * whose `onentry` callback turns a thrown error into an *uncaught* exception
 * instead of a rejection) so a violation rejects cleanly. Each entry's declared
 * size is checked from its header *before* its body is read, and the source
 * stream is destroyed on the first violation — so a decompression bomb is
 * aborted up front rather than after the whole stream is consumed.
 */
function validateArchive(resolved: string, limits: ArchiveLimits): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let entryCount = 0;
    let totalBytes = 0;
    let settled = false;

    const source = createReadStream(resolved);
    const parser = new Parser({});

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      source.destroy(); // stop decompressing immediately
      reject(err);
    };
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };

    parser.on('entry', (entry: ReadEntry) => {
      if (settled) {
        entry.resume();
        return;
      }
      try {
        if (inspectEntry(entry, limits) === 'extract') {
          entryCount += 1;
          if (entryCount > limits.maxEntries) {
            return fail(
              new ReplicaxError('Archive contains too many entries; refusing to extract.'),
            );
          }
          totalBytes += entry.size ?? 0;
          if (totalBytes > limits.maxTotalBytes) {
            return fail(
              new ReplicaxError('Archive is too large when uncompressed; refusing to extract.'),
            );
          }
        }
      } catch (err) {
        return fail(err as Error);
      }
      entry.resume(); // drain the body so the parser advances to the next header
    });
    parser.on('end', finish);
    parser.on('error', (err: Error) => fail(err));
    source.on('error', (err: Error) => fail(err));
    source.pipe(parser);
  });
}

/**
 * Safely extract a gzipped tar archive into `destDir`. Validates the whole
 * archive against `limits` first (size, entry count, per-file size, entry
 * types, path traversal), then extracts with the same per-entry guard applied
 * a second time as defense in depth. Throws {@link ReplicaxError} on any
 * violation, having written nothing.
 */
export async function safeExtract(
  archivePath: string,
  destDir: string,
  limits: ArchiveLimits,
): Promise<void> {
  const resolved = path.resolve(archivePath);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat) {
    throw new ReplicaxError(`Archive not found: ${archivePath}`);
  }
  if (stat.size > limits.maxCompressedBytes) {
    throw new ReplicaxError('Archive file is too large; refusing to extract.');
  }

  await validateArchive(resolved, limits);

  await fs.ensureDir(destDir);
  await tarExtract({
    file: resolved,
    cwd: destDir,
    strip: 0,
    filter: (_p, entry) => {
      try {
        // During extraction tar types this as `Stats | ReadEntry`; it is always
        // a ReadEntry here. validateArchive already rejected anything fatal, so
        // a defensive throw just skips the entry.
        return inspectEntry(entry as ReadEntry, limits) === 'extract';
      } catch {
        return false;
      }
    },
  });
}

/** Extract a profile archive into a fresh temp directory and return its path. */
export async function extractToTemp(archivePath: string): Promise<string> {
  if (!(await fs.pathExists(path.resolve(archivePath)))) {
    throw new ReplicaxError(`Archive not found: ${archivePath}`);
  }
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'replicax-import-'));
  try {
    await safeExtract(archivePath, tmp, PROFILE_ARCHIVE_LIMITS);
  } catch (err) {
    await fs.remove(tmp).catch(() => undefined);
    throw err;
  }
  return tmp;
}

/**
 * Find the directory inside an extracted archive that actually holds the
 * profile (the one containing profile.json). Searches the root, a nested
 * `.replicax`, and one level of subdirectories.
 */
export async function findProfileRoot(dir: string): Promise<string | null> {
  const hasProfile = async (d: string): Promise<boolean> =>
    fs.pathExists(path.join(d, PROFILE_FILES.profile));

  if (await hasProfile(dir)) return dir;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const candidate = path.join(dir, entry.name);
      if (await hasProfile(candidate)) return candidate;
    }
  }
  return null;
}
