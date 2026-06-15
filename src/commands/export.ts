import path from 'node:path';
import fs from 'fs-extra';
import ora from 'ora';
import { exportProfile } from '@/core/archive';
import { loadBundle, profileDir, profileExists, resolveProfileDir } from '@/core/profile-store';
import { ReplicaxError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export interface ExportOptions {
  out?: string;
  profile?: string;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'profile'
  );
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

  const outPath = path.resolve(options.out ?? `${slug(bundle.profile.name)}.replicax.tar.gz`);

  const spinner = ora({ text: 'Packaging profile…' }).start();
  await exportProfile(dir, outPath);
  spinner.stop();

  const { size } = await fs.stat(outPath);
  logger.success(
    `Exported "${bundle.profile.name}" → ${path.relative(process.cwd(), outPath)} (${formatBytes(size)})`,
  );
  logger.hint('Share it, then `replicax import <file>` elsewhere.');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
