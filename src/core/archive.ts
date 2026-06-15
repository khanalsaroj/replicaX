import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { create as tarCreate, extract as tarExtract } from 'tar';
import { PROFILE_FILES } from '@/constants';

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

/** Extract an archive into a fresh temp directory and return its path. */
export async function extractToTemp(archivePath: string): Promise<string> {
  const resolved = path.resolve(archivePath);
  if (!(await fs.pathExists(resolved))) {
    throw new Error(`Archive not found: ${archivePath}`);
  }
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'replicax-import-'));
  await tarExtract({ file: resolved, cwd: tmp, strip: 0 });
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
