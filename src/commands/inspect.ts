import Table from 'cli-table3';
import { CATEGORY_BY_ID } from '@/config/supported-files';
import { loadBundle, profileDir, profileExists, resolveProfileDir } from '@/core/profile-store';
import type { ProfileBundle } from '@/schema';
import { ReplicaxError } from '@/utils/errors';
import { logger, pc } from '@/utils/logger';
import { renderTree } from '@/utils/tree';
import { formatBytes } from '@/utils/format';

export type InspectSection = 'profile' | 'tooling' | 'structure' | 'metadata' | 'detections';
const SECTIONS: InspectSection[] = ['profile', 'tooling', 'structure', 'metadata', 'detections'];

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
    logger.out(JSON.stringify(jsonPayload(bundle, section), null, 2));
    return;
  }

  if (!section || section === 'profile') printProfile(bundle);
  if (!section || section === 'metadata') printMetadata(bundle);
  if (!section || section === 'detections') printDetectionsSection(bundle);
  if (!section || section === 'tooling') printTooling(bundle);
  if (!section || section === 'structure') printStructure(bundle);
}

/** Build the `--json` payload, with `detections` resolved from metadata. */
function jsonPayload(bundle: ProfileBundle, section: InspectSection | undefined): unknown {
  if (!section) return bundle;
  if (section === 'detections') return { detections: bundle.metadata.detections ?? [] };
  return { [section]: bundle[section] };
}

function printDetectionsSection(bundle: ProfileBundle): void {
  const detections = bundle.metadata.detections ?? [];
  logger.out(pc.bold(`Detections (${detections.length})`));
  if (detections.length === 0) {
    logger.out('  (none)');
    logger.out('');
    return;
  }
  const table = new Table({
    head: ['Category', 'Tool', 'Confidence', 'Evidence'],
    style: { head: ['cyan'], border: ['dim'] },
  });
  for (const d of detections) {
    table.push([d.category, d.name, `${Math.round(d.confidence * 100)}%`, d.evidence.join(', ')]);
  }
  logger.out(table.toString());
  logger.out('');
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
