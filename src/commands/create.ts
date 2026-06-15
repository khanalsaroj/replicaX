import path from 'node:path';
import fs from 'fs-extra';
import ora from 'ora';
import { loadBundle, profileDir, profileExists, resolveProfileDir } from '@/core/profile-store';
import { verifyChecksum } from '@/core/checksum';
import { ConflictResolver, type ConflictPolicy } from '@/core/conflict-resolver';
import { generateProject } from '@/core/project-generator';
import { installDependencies } from '@/core/installer';
import { ReplicaxError } from '@/utils/errors';
import { logger, pc, setVerbose } from '@/utils/logger';
import { relPosix } from '@/utils/paths';

export interface CreateOptions {
  profile?: string;
  skipInstall?: boolean;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
}

export async function createCommand(projectName: string, options: CreateOptions): Promise<void> {
  if (options.verbose) setVerbose(true);

  if (!projectName || projectName.trim().length === 0) {
    throw new ReplicaxError('A project name is required: replicax create <project-name>');
  }

  const dir = options.profile
    ? await resolveProfileDir(options.profile)
    : profileDir(process.cwd());

  if (!(await profileExists(dir))) {
    throw new ReplicaxError('No ReplicaX profile found.', [
      'Run `replicax init` in a source project first,',
      'or point at one with `replicax create <name> --profile <path>`.',
    ]);
  }

  const bundle = await loadBundle(dir);

  const mismatches = verifyChecksum(bundle.tooling, bundle.checksum);
  if (mismatches.length > 0) {
    logger.warn(`Profile integrity check found ${mismatches.length} issue(s); continuing anyway.`);
    logger.hint('Run `replicax validate` for details.');
  }

  const targetDir = path.resolve(process.cwd(), projectName);
  const leafName = path.basename(targetDir);

  if (path.resolve(process.cwd()) === targetDir) {
    throw new ReplicaxError('Refusing to scaffold into the current directory.', [
      'Pass a new project name, e.g. `replicax create my-app`.',
    ]);
  }

  const policy: ConflictPolicy = options.force ? 'overwrite' : 'prompt';
  const conflict = new ConflictResolver(policy);

  logger.info(
    `Creating ${pc.bold(leafName)} from profile ${pc.bold(bundle.profile.name)}${options.dryRun ? pc.dim(' (dry run)') : ''}`,
  );

  const result = await generateProject({
    bundle,
    targetDir,
    projectName: leafName,
    dryRun: Boolean(options.dryRun),
    conflict,
  });

  if (result.unsafeSkipped.length > 0) {
    logger.warn(`Skipped ${result.unsafeSkipped.length} unsafe path(s) in the profile.`);
  }

  logger.newline();
  logger.success(
    `${result.dirsCreated} director(ies) and ${result.filesWritten} file(s) ${options.dryRun ? 'would be written' : 'written'}` +
      (result.filesSkipped ? `, ${result.filesSkipped} skipped` : ''),
  );

  if (options.dryRun) {
    logger.newline();
    logger.info('Dry run — no files were written.');
    return;
  }

  logger.hint(`Location: ${relPosix(process.cwd(), targetDir)}/`);

  await maybeInstall(
    bundle.metadata.packageManager,
    targetDir,
    options,
    Boolean(bundle.tooling.packageJson),
  );

  logger.newline();
  logger.success(`Project ${pc.bold(leafName)} is ready.`);
}

async function maybeInstall(
  manager: string,
  targetDir: string,
  options: CreateOptions,
  hasPackageJson: boolean,
): Promise<void> {
  if (options.skipInstall) {
    logger.hint('Skipped dependency install (--skip-install).');
    return;
  }
  if (!hasPackageJson) return;
  if (manager === 'unknown') {
    logger.hint('No package manager detected; run your install command manually.');
    return;
  }
  // Only install if there is actually something declared to install.
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = (await fs.readJson(pkgPath).catch(() => null)) as {
    devDependencies?: Record<string, string>;
  } | null;
  if (!pkg?.devDependencies || Object.keys(pkg.devDependencies).length === 0) {
    logger.hint('No dependencies to install.');
    return;
  }

  logger.newline();
  logger.info(`Installing dependencies with ${manager}…`);
  const ok = await installDependencies(targetDir, manager as never);
  if (ok) logger.success('Dependencies installed.');
  else logger.warn('Dependency install did not complete; run it manually.');
}
