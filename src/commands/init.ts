import path from 'node:path';
import fs from 'fs-extra';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { DEFAULT_IGNORE_FILE_CONTENTS, IGNORE_FILE } from '@/constants';
import { scanProject } from '@/core/scanner';
import { buildBundle } from '@/core/profile-generator';
import { profileDir, profileExists, saveBundle } from '@/core/profile-store';
import { logger, setVerbose } from '@/utils/logger';
import { relPosix } from '@/utils/paths';
import { printScanSummary, reportSkippedSecrets } from '@/commands/report';
import { renderTree } from '@/utils/tree';

export interface InitOptions {
  name?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  if (options.verbose) setVerbose(true);

  const root = process.cwd();
  const dir = profileDir(root);
  const alreadyExists = await profileExists(dir);

  const spinner = ora({ text: 'Scanning project…', isEnabled: !options.verbose }).start();
  const scan = await scanProject(root);
  spinner.succeed(
    `Scanned ${scan.tooling.files.length} config file(s) and ${scan.structure.directories.length} director(ies)`,
  );

  const name = options.name ?? path.basename(path.resolve(root)) ?? 'project';
  const bundle = buildBundle({
    name,
    tooling: scan.tooling,
    structure: scan.structure,
    metadata: scan.metadata,
  });

  reportSkippedSecrets(scan.skippedSecrets);
  printScanSummary(bundle);
  logger.out(renderTree(bundle.structure.directories, bundle.structure.root));

  if (options.dryRun) {
    logger.newline();
    logger.info('Dry run — no files were written.');
    return;
  }

  if (alreadyExists) {
    logger.warn('A ReplicaX profile already exists here and will be replaced.');
  }

  await saveBundle(dir, bundle);
  await maybeWriteIgnoreFile(root);

  logger.newline();
  logger.success(`Profile "${name}" written to ${relPosix(root, dir)}/`);
  logger.hint('Create a project from it with: replicax create <project-name>');
}

/** Drop a starter `.replicaxignore` if the project doesn't already have one. */
async function maybeWriteIgnoreFile(root: string): Promise<void> {
  const file = path.join(root, IGNORE_FILE);
  if (await fs.pathExists(file)) return;

  const create = process.stdin.isTTY
    ? await confirm({
        message: `Create a starter ${IGNORE_FILE} to control what gets exported?`,
        default: true,
      })
    : false;

  if (create) {
    await fs.writeFile(file, DEFAULT_IGNORE_FILE_CONTENTS, 'utf8');
    logger.success(`Wrote ${IGNORE_FILE}`);
  }
}
