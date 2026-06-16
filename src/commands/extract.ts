import path from 'node:path';
import ora from 'ora';
import { scanProject } from '@/core/scanner';
import { buildBundle } from '@/core/profile-generator';
import { profileDir, profileExists, saveBundle } from '@/core/profile-store';
import { downloadRepo, parseGitHubRef, refLabel } from '@/core/github';
import { logger, setVerbose } from '@/utils/logger';
import { relPosix } from '@/utils/paths';
import { printScanSummary, reportSkippedSecrets } from '@/commands/report';
import { renderTree } from '@/utils/tree';

export interface ExtractOptions {
  name?: string;
  ref?: string;
  out?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * `replicax extract <repo>` — capture a profile from a remote GitHub repo. It is
 * `init` pointed at a downloaded repo: fetch the tarball, run the normal scan,
 * and write the profile into the current directory (or `--out`).
 */
export async function extractCommand(repo: string, options: ExtractOptions): Promise<void> {
  if (options.verbose) setVerbose(true);

  const parsed = parseGitHubRef(repo);
  const target = { owner: parsed.owner, repo: parsed.repo, ref: options.ref ?? parsed.ref };
  const label = refLabel(target);

  const fetchSpinner = ora({
    text: `Fetching ${label} from GitHub…`,
    isEnabled: !options.verbose,
  }).start();
  let downloaded;
  try {
    downloaded = await downloadRepo(target);
  } catch (err) {
    fetchSpinner.fail(`Could not fetch ${label}`);
    throw err;
  }
  fetchSpinner.succeed(`Downloaded ${label}`);

  try {
    const name = options.name ?? target.repo;

    const scanSpinner = ora({ text: 'Scanning repository…', isEnabled: !options.verbose }).start();
    const scan = await scanProject(downloaded.dir);
    scanSpinner.succeed(
      `Scanned ${scan.tooling.files.length} config file(s) and ${scan.structure.directories.length} director(ies)`,
    );

    // The tarball extracted into a temp folder named <owner>-<repo>-<sha>; stamp
    // the repo name (or --name) as the profile's root, not that temp name.
    scan.structure.root = name;

    const bundle = buildBundle({
      name,
      tooling: scan.tooling,
      structure: scan.structure,
      metadata: scan.metadata,
      // Captured from a remote repo we don't control — untrusted for auto-install.
      source: 'github',
    });

    reportSkippedSecrets(scan.skippedSecrets);
    printScanSummary(bundle);
    logger.out(renderTree(bundle.structure.directories, bundle.structure.root));

    if (options.dryRun) {
      logger.newline();
      logger.info('Dry run — no files were written.');
      return;
    }

    const outRoot = options.out ? path.resolve(options.out) : process.cwd();
    const dir = profileDir(outRoot);
    if (await profileExists(dir)) {
      logger.warn(
        `A ReplicaX profile already exists in ${relPosix(process.cwd(), dir)}/ — replacing it.`,
      );
    }

    await saveBundle(dir, bundle);

    logger.newline();
    logger.success(`Profile "${name}" written to ${relPosix(process.cwd(), dir)}/`);
    logger.hint('Create a project from it with: replicax create <project-name>');
  } finally {
    await downloaded.cleanup();
  }
}
