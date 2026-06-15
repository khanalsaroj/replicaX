import { CATEGORY_BY_ID } from '@/config/supported-files';
import type { ProfileBundle, Tooling } from '@/schema';
import { logger, pc } from '@/utils/logger';

/** Group captured files by category and return ordered [label, count] pairs. */
export function toolingByCategory(tooling: Tooling): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const file of tooling.files) {
    counts.set(file.category, (counts.get(file.category) ?? 0) + 1);
  }
  if (tooling.packageJson) {
    counts.set('package', (counts.get('package') ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, n]): [string, number] => [CATEGORY_BY_ID.get(id)?.label ?? id, n])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** Print the standard post-scan summary used by `init` and `sync`. */
export function printScanSummary(bundle: ProfileBundle): void {
  const { metadata, tooling, structure } = bundle;
  logger.newline();
  logger.info(pc.bold('Captured setup'));
  logger.hint(`language       ${metadata.language}`);
  logger.hint(`framework      ${metadata.framework}`);
  logger.hint(`packageManager ${metadata.packageManager}`);
  logger.hint(`nodeVersion    ${metadata.nodeVersion}`);
  logger.newline();

  logger.info(pc.bold(`Tooling (${tooling.files.length + (tooling.packageJson ? 1 : 0)} files)`));
  for (const [label, count] of toolingByCategory(tooling)) {
    logger.hint(`${label.padEnd(32)} ${count}`);
  }
  logger.newline();
  logger.info(pc.bold(`Structure (${structure.directories.length} directories)`));
}

/** Warn about any files the secret guard excluded. */
export function reportSkippedSecrets(skipped: string[]): void {
  if (skipped.length === 0) return;
  logger.warn(`Excluded ${skipped.length} protected file(s) from the profile:`);
  for (const file of skipped) logger.hint(file);
}
