import path from 'node:path';
import ora from 'ora';
import { loadBundle, profileDir, profileExists, resolveProfileDir } from '@/core/profile-store';
import { verifyChecksum } from '@/core/checksum';
import { ConflictResolver, type ConflictPolicy } from '@/core/conflict-resolver';
import { generateProject } from '@/core/project-generator';
import { installDependencies } from '@/core/installer';
import type { PackageManager, ProfileBundle, ProfileSource } from '@/schema';
import { ReplicaxError } from '@/utils/errors';
import { logger, pc, setVerbose } from '@/utils/logger';
import { relPosix } from '@/utils/paths';

export interface CreateOptions {
  profile?: string;
  skipInstall?: boolean;
  install?: boolean;
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

  await maybeInstall(bundle, targetDir, options);

  logger.newline();
  logger.success(`Project ${pc.bold(leafName)} is ready.`);
}

/**
 * The install decision for a profile. Pure (no I/O, no logging) so the
 * trust-gating policy is unit-testable without spawning a package manager.
 *
 * `install` runs the package manager — which executes lifecycle scripts from
 * the captured devDependencies, so it is a trust boundary. A `local` profile is
 * trusted and installs by default; an untrusted (`github`/`import`) profile is
 * `blocked` unless the user opts in with `--install`.
 */
export type InstallDecision =
  | { kind: 'skip-flag' }
  | { kind: 'no-deps' }
  | { kind: 'no-manager' }
  | {
      kind: 'blocked';
      source: ProfileSource;
      manager: PackageManager;
      devDeps: Record<string, string>;
    }
  | {
      kind: 'install';
      trusted: boolean;
      source: ProfileSource;
      manager: PackageManager;
      devDeps: Record<string, string>;
    };

export function decideInstall(
  bundle: ProfileBundle,
  options: Pick<CreateOptions, 'skipInstall' | 'install'>,
): InstallDecision {
  if (options.skipInstall) return { kind: 'skip-flag' };
  const devDeps = bundle.tooling.packageJson?.devDependencies ?? {};
  if (Object.keys(devDeps).length === 0) return { kind: 'no-deps' };
  const manager = bundle.metadata.packageManager;
  if (manager === 'unknown') return { kind: 'no-manager' };

  const source = bundle.profile.source ?? 'local';
  const trusted = source === 'local';
  if (!trusted && !options.install) return { kind: 'blocked', source, manager, devDeps };
  return { kind: 'install', trusted, source, manager, devDeps };
}

/** Print the devDependencies an install would add (capped for readability). */
function printDependencySummary(devDeps: Record<string, string>): void {
  const names = Object.keys(devDeps).sort();
  for (const name of names.slice(0, 10)) logger.hint(`  ${name}  ${devDeps[name]}`);
  if (names.length > 10) logger.hint(`  …and ${names.length - 10} more`);
}

/** Act on the install decision: report it, and run the manager when allowed. */
async function maybeInstall(
  bundle: ProfileBundle,
  targetDir: string,
  options: CreateOptions,
): Promise<void> {
  const decision = decideInstall(bundle, options);

  switch (decision.kind) {
    case 'skip-flag':
      logger.hint('Skipped dependency install (--skip-install).');
      return;
    case 'no-deps':
      if (bundle.tooling.packageJson) logger.hint('No dependencies to install.');
      return;
    case 'no-manager':
      logger.hint('No package manager detected; run your install command manually.');
      return;
    case 'blocked':
      logger.newline();
      logger.warn(
        `Profile source is "${decision.source}" — skipping dependency install for safety.`,
      );
      logger.hint(
        `Installing runs package lifecycle scripts. ${Object.keys(decision.devDeps).length} devDependencies would be added with ${decision.manager}:`,
      );
      printDependencySummary(decision.devDeps);
      logger.hint(
        `Review them, then run \`${decision.manager} install\`, or re-run create with --install.`,
      );
      return;
    case 'install': {
      logger.newline();
      if (!decision.trusted) {
        logger.warn(
          `Installing for an untrusted ("${decision.source}") profile — package lifecycle scripts can execute code.`,
        );
      }
      logger.info(
        `Installing ${Object.keys(decision.devDeps).length} devDependencies with ${decision.manager}…`,
      );
      printDependencySummary(decision.devDeps);
      const ok = await installDependencies(targetDir, decision.manager);
      if (ok) logger.success('Dependencies installed.');
      else logger.warn('Dependency install did not complete; run it manually.');
      return;
    }
  }
}
