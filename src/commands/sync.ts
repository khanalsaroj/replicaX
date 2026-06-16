import ora from 'ora';
import { scanProject } from '@/core/scanner';
import { buildBundle } from '@/core/profile-generator';
import { loadBundle, profileDir, profileExists, saveBundle } from '@/core/profile-store';
import { diffBundles, hasChanges, type ProfileDiff } from '@/core/diff';
import { logger, pc, setVerbose } from '@/utils/logger';
import { ReplicaxError } from '@/utils/errors';
import { reportSkippedSecrets } from '@/commands/report';

export interface SyncOptions {
  diff?: boolean;
  force?: boolean;
  verbose?: boolean;
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  if (options.verbose) setVerbose(true);

  const root = process.cwd();
  const dir = profileDir(root);
  if (!(await profileExists(dir))) {
    throw new ReplicaxError('No ReplicaX profile to sync.', ['Run `replicax init` first.']);
  }

  const existing = await loadBundle(dir);

  const spinner = ora({ text: 'Re-scanning project…', isEnabled: !options.verbose }).start();
  const scan = await scanProject(root);
  spinner.succeed('Re-scan complete');

  const next = buildBundle({
    name: existing.profile.name,
    description: existing.profile.description,
    tooling: scan.tooling,
    structure: scan.structure,
    metadata: scan.metadata,
    // A sync re-captures the local project, so the result is locally trusted.
    source: 'local',
    existing: existing.profile,
  });

  const diff = diffBundles(existing, next);

  if (!hasChanges(diff) && !options.force) {
    logger.success('Profile is already up to date.');
    return;
  }

  reportSkippedSecrets(scan.skippedSecrets);
  printDiff(diff, Boolean(options.diff));

  await saveBundle(dir, next);
  logger.newline();
  logger.success('Profile updated.');
}

function printDiff(diff: ProfileDiff, detailed: boolean): void {
  const { files, directories, metadataChanges, packageJsonChanged } = diff;

  logger.newline();
  logger.info(pc.bold('Changes since last sync'));
  logger.hint(
    `files     ${pc.green(`+${files.added.length}`)} ${pc.yellow(`~${files.changed.length}`)} ${pc.red(`-${files.removed.length}`)}`,
  );
  logger.hint(
    `dirs      ${pc.green(`+${directories.added.length}`)} ${pc.red(`-${directories.removed.length}`)}`,
  );
  if (packageJsonChanged) logger.hint('package.json template changed');
  if (metadataChanges.length) {
    for (const change of metadataChanges) {
      logger.hint(`metadata  ${change.field}: ${change.from} → ${change.to}`);
    }
  }

  if (!detailed) return;

  logger.newline();
  printList('added files', files.added, pc.green('+'));
  printList('changed files', files.changed, pc.yellow('~'));
  printList('removed files', files.removed, pc.red('-'));
  printList('added directories', directories.added, pc.green('+'));
  printList('removed directories', directories.removed, pc.red('-'));
}

function printList(title: string, items: string[], marker: string): void {
  if (items.length === 0) return;
  logger.info(pc.bold(title));
  for (const item of items) logger.hint(`${marker} ${item}`);
}
