import Table from 'cli-table3';
import { CATEGORY_BY_ID } from '@/config/supported-files';
import { loadBundle, profileDir, profileExists, resolveProfileDir } from '@/core/profile-store';
import type { ProfileBundle } from '@/schema';
import { ReplicaxError } from '@/utils/errors';
import { logger, pc } from '@/utils/logger';
import { renderTree } from '@/utils/tree';

export type InspectSection = 'profile' | 'tooling' | 'structure' | 'metadata';
const SECTIONS: InspectSection[] = ['profile', 'tooling', 'structure', 'metadata'];

export interface InspectOptions {
  json?: boolean;
  section?: string;
  profile?: string;
}

export async function inspectCommand(options: InspectOptions): Promise<void> {
  const dir = options.profile
    ? await resolveProfileDir(options.profile)
    : profileDir(process.cwd());

  if (!(await profileExists(dir))) {
    throw new ReplicaxError('No ReplicaX profile found.', ['Run `replicax init` first.']);
  }

  if (options.section && !SECTIONS.includes(options.section as InspectSection)) {
    throw new ReplicaxError(`Unknown section "${options.section}".`, [
      `Valid sections: ${SECTIONS.join(', ')}.`,
    ]);
  }

  const bundle = await loadBundle(dir);
  const section = options.section as InspectSection | undefined;

  if (options.json) {
    const payload = section ? { [section]: bundle[section] } : bundle;
    logger.out(JSON.stringify(payload, null, 2));
    return;
  }

  if (!section || section === 'profile') printProfile(bundle);
  if (!section || section === 'metadata') printMetadata(bundle);
  if (!section || section === 'tooling') printTooling(bundle);
  if (!section || section === 'structure') printStructure(bundle);
}

function printProfile(bundle: ProfileBundle): void {
  const p = bundle.profile;
  logger.out(pc.bold('Profile'));
  logger.out(`  name             ${p.name}`);
  logger.out(`  version          ${p.version}`);
  if (p.description) logger.out(`  description      ${p.description}`);
  logger.out(`  createdAt        ${p.createdAt}`);
  if (p.updatedAt) logger.out(`  updatedAt        ${p.updatedAt}`);
  logger.out(`  replicaxVersion  ${p.replicaxVersion}`);
  logger.out('');
}

function printMetadata(bundle: ProfileBundle): void {
  const m = bundle.metadata;
  logger.out(pc.bold('Metadata'));
  logger.out(`  language         ${m.language}`);
  logger.out(`  framework        ${m.framework}`);
  logger.out(`  packageManager   ${m.packageManager}`);
  logger.out(`  nodeVersion      ${m.nodeVersion}`);
  logger.out(`  platform         ${m.platform}`);
  logger.out('');
}

function printTooling(bundle: ProfileBundle): void {
  const { tooling } = bundle;
  const total = tooling.files.length + (tooling.packageJson ? 1 : 0);
  logger.out(pc.bold(`Tooling (${total} file(s))`));

  const table = new Table({
    head: ['Category', 'File', 'Variant', 'Size'],
    style: { head: ['cyan'], border: ['dim'] },
  });

  if (tooling.packageJson) {
    table.push(['Package Management & Monorepos', 'package.json', 'json', 'template']);
  }
  for (const file of [...tooling.files].sort((a, b) => a.path.localeCompare(b.path))) {
    table.push([
      CATEGORY_BY_ID.get(file.category)?.label ?? file.category,
      file.path,
      file.variant,
      formatBytes(file.bytes),
    ]);
  }
  logger.out(table.toString());
  logger.out('');
}

function printStructure(bundle: ProfileBundle): void {
  const { structure } = bundle;
  logger.out(pc.bold(`Structure (${structure.directories.length} director(ies))`));
  logger.out(renderTree(structure.directories, structure.root));
  logger.out('');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
