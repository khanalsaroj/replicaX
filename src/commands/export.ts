import path from 'node:path';
import fs from 'fs-extra';
import ora from 'ora';
import { exportProfile } from '@/core/archive';
import { loadBundle, profileDir, profileExists, resolveProfileDir } from '@/core/profile-store';
import { ReplicaxError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { formatBytes } from '@/utils/format';
import { slugify } from '@/utils/slug';

export interface ExportOptions {
  out?: string;
  profile?: string;
}

export async function exportCommand(options: ExportOptions): Promise<void> {
  const dir = options.profile
    ? await resolveProfileDir(options.profile)
    : profileDir(process.cwd());

  if (!(await profileExists(dir))) {
    throw new ReplicaxError('No ReplicaX profile found to export.', ['Run `replicax init` first.']);
  }

  // Validate before packaging so we never ship a corrupt archive.
  const bundle = await loadBundle(dir);

  const outPath = path.resolve(
    options.out ?? `${slugify(bundle.profile.name, 'profile')}.replicax.tar.gz`,
  );

  const spinner = ora({ text: 'Packaging profile…' }).start();
  await exportProfile(dir, outPath);
  spinner.stop();

  const { size } = await fs.stat(outPath);
  logger.success(
    `Exported "${bundle.profile.name}" → ${path.relative(process.cwd(), outPath)} (${formatBytes(size)})`,
  );
  logger.hint('Share it, then `replicax import <file>` elsewhere.');
}
