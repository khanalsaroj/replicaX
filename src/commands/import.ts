import fs from 'fs-extra';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { extractToTemp, findProfileRoot } from '@/core/archive';
import { loadBundle, profileDir, profileExists, saveBundle } from '@/core/profile-store';
import { ReplicaxError } from '@/utils/errors';
import { logger, pc } from '@/utils/logger';
import { relPosix } from '@/utils/paths';

export interface ImportOptions {
  force?: boolean;
}

export async function importCommand(archivePath: string, options: ImportOptions): Promise<void> {
  if (!archivePath) {
    throw new ReplicaxError('An archive path is required: replicax import <file>');
  }

  const spinner = ora({ text: 'Extracting archive…' }).start();
  const tmp = await extractToTemp(archivePath);
  try {
    const source = await findProfileRoot(tmp);
    if (!source) {
      spinner.fail('No profile found in archive');
      throw new ReplicaxError('The archive does not contain a ReplicaX profile.');
    }

    // Validate the incoming profile before adopting it.
    const bundle = await loadBundle(source);
    // Adopted from an external archive — mark it untrusted so `create` makes
    // dependency install opt-in regardless of what the archive claimed.
    bundle.profile.source = 'import';
    spinner.succeed(`Validated profile "${bundle.profile.name}"`);

    const dest = profileDir(process.cwd());
    if (await profileExists(dest)) {
      const overwrite =
        options.force ||
        (process.stdin.isTTY
          ? await confirm({
              message: 'A profile already exists here. Overwrite it?',
              default: false,
            })
          : false);
      if (!overwrite) {
        throw new ReplicaxError('A profile already exists.', [
          'Re-run with --force to overwrite it.',
        ]);
      }
      await fs.remove(dest);
    }

    await saveBundle(dest, bundle);
    logger.newline();
    logger.success(
      `Imported "${pc.bold(bundle.profile.name)}" into ${relPosix(process.cwd(), dest)}/`,
    );
    logger.hint('Create a project with: replicax create <project-name>');
  } finally {
    await fs.remove(tmp).catch(() => undefined);
  }
}
