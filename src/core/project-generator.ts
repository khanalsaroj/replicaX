import path from 'node:path';
import fs from 'fs-extra';
import type { ProfileBundle } from '@/schema';
import { logger } from '@/utils/logger';
import { safeJoinable } from '@/utils/paths';
import { renderPackageJson } from '@/core/package-template';
import type { ConflictResolver } from '@/core/conflict-resolver';

export interface GenerateOptions {
  bundle: ProfileBundle;
  /** Absolute path of the directory to create the project in. */
  targetDir: string;
  /** Name stamped into the generated package.json. */
  projectName: string;
  dryRun: boolean;
  conflict: ConflictResolver;
}

export type GenerateAction = 'create' | 'overwrite' | 'skip';

export interface GenerateEntry {
  kind: 'dir' | 'file';
  path: string;
  action: GenerateAction;
}

export interface GenerateResult {
  entries: GenerateEntry[];
  dirsCreated: number;
  filesWritten: number;
  filesSkipped: number;
  unsafeSkipped: string[];
}

/** Reproduce a captured setup into a new project directory. */
export async function generateProject(options: GenerateOptions): Promise<GenerateResult> {
  const { bundle, targetDir, projectName, dryRun, conflict } = options;
  const result: GenerateResult = {
    entries: [],
    dirsCreated: 0,
    filesWritten: 0,
    filesSkipped: 0,
    unsafeSkipped: [],
  };

  if (!dryRun) await fs.ensureDir(targetDir);

  // 1. Recreate the folder hierarchy (directories only).
  for (const dir of bundle.structure.directories) {
    const safe = safeJoinable(dir);
    if (!safe) {
      result.unsafeSkipped.push(dir);
      continue;
    }
    const full = path.join(targetDir, safe);
    const existed = await fs.pathExists(full);
    if (!dryRun) await fs.ensureDir(full);
    if (!existed) result.dirsCreated += 1;
    result.entries.push({ kind: 'dir', path: safe, action: existed ? 'skip' : 'create' });
  }

  // 2. Write the generated package.json (name adapted to the new project).
  if (bundle.tooling.packageJson) {
    await writeFile(
      'package.json',
      renderPackageJson(bundle.tooling.packageJson, projectName),
      options,
      result,
    );
  }

  // 3. Write every captured config file verbatim.
  for (const file of bundle.tooling.files) {
    await writeFile(file.path, file.content, options, result);
  }

  return result;
}

async function writeFile(
  relPath: string,
  content: string,
  options: GenerateOptions,
  result: GenerateResult,
): Promise<void> {
  const safe = safeJoinable(relPath);
  if (!safe) {
    result.unsafeSkipped.push(relPath);
    logger.warn(`Refusing to write unsafe path from profile: ${relPath}`);
    return;
  }

  const full = path.join(options.targetDir, safe);
  const exists = await fs.pathExists(full);

  let action: GenerateAction = exists ? 'overwrite' : 'create';
  if (exists) {
    const decision = await options.conflict.resolve(safe);
    if (decision === 'skip') {
      result.filesSkipped += 1;
      result.entries.push({ kind: 'file', path: safe, action: 'skip' });
      logger.detail(`skip: ${safe}`);
      return;
    }
    action = 'overwrite';
  }

  if (!options.dryRun) {
    await fs.ensureDir(path.dirname(full));
    await fs.writeFile(full, content, 'utf8');
  }
  result.filesWritten += 1;
  result.entries.push({ kind: 'file', path: safe, action });
  logger.detail(`${action}: ${safe}`);
}
