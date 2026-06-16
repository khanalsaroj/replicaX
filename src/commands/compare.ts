import path from 'node:path';
import fs from 'fs-extra';
import type { ProfileBundle } from '@/schema';
import { loadBundle, resolveProfileDir } from '@/core/profile-store';
import { scanProject } from '@/core/scanner';
import { buildBundle } from '@/core/profile-generator';
import { compareBundles, comparisonHasChanges, type Comparison } from '@/core/compare';
import { ReplicaxError } from '@/utils/errors';
import { logger, pc } from '@/utils/logger';

export interface CompareOptions {
  json?: boolean;
}

interface Resolved {
  bundle: ProfileBundle;
  label: string;
}

/**
 * Resolve a `compare` argument to a profile bundle. A path that already holds a
 * profile is loaded directly; a plain project directory is scanned in memory, so
 * `compare ./projectA ./projectB` works without either side being committed.
 */
async function resolveBundle(input: string): Promise<Resolved> {
  const resolved = path.resolve(input);
  if (!(await fs.pathExists(resolved))) {
    throw new ReplicaxError(`Path not found: ${input}`);
  }

  try {
    const dir = await resolveProfileDir(input);
    const bundle = await loadBundle(dir);
    return { bundle, label: `${bundle.profile.name} (profile)` };
  } catch {
    // Not a profile — fall through and scan it as a project directory.
  }

  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new ReplicaxError(`Cannot compare "${input}": not a profile or a project directory.`, [
      'Pass a project folder or a directory containing a .replicax profile.',
    ]);
  }

  const scan = await scanProject(resolved);
  const bundle = buildBundle({
    name: path.basename(resolved) || 'project',
    tooling: scan.tooling,
    structure: scan.structure,
    metadata: scan.metadata,
  });
  return { bundle, label: `${path.basename(resolved)} (scanned)` };
}

export async function compareCommand(
  source: string,
  target: string,
  options: CompareOptions,
): Promise<void> {
  const [a, b] = await Promise.all([resolveBundle(source), resolveBundle(target)]);
  const comparison = compareBundles(a.bundle, b.bundle);

  if (options.json) {
    logger.out(JSON.stringify({ source: a.label, target: b.label, ...comparison }, null, 2));
    return;
  }

  logger.out(pc.bold(`Comparing ${a.label} → ${b.label}`));
  logger.out('');

  if (!comparisonHasChanges(comparison)) {
    logger.out('No differences.');
    return;
  }

  printGroup('Added', collect(comparison, 'added'), pc.green('+'));
  printGroup('Removed', collect(comparison, 'removed'), pc.red('-'));
  printGroup('Changed', collect(comparison, 'changed'), pc.yellow('~'));
}

/** Aggregate one bucket across every section, annotating items with the section. */
function collect(comparison: Comparison, bucket: 'added' | 'removed' | 'changed'): string[] {
  const out: string[] = [];
  for (const section of comparison.sections) {
    for (const item of section[bucket]) {
      out.push(`${item} ${pc.dim(`(${section.title})`)}`);
    }
  }
  return out;
}

function printGroup(label: string, items: string[], marker: string): void {
  if (items.length === 0) return;
  logger.out(pc.bold(`${label}:`));
  for (const item of items) logger.out(`  ${marker} ${item}`);
  logger.out('');
}
