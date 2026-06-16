import path from 'node:path';
import { loadBundle, resolveProfileDir } from '@/core/profile-store';
import { scanProject } from '@/core/scanner';
import { runAudit } from '@/core/audit/engine';
import type { AuditContext } from '@/core/audit/rules';
import { logger, pc } from '@/utils/logger';
import { statusLine } from '@/commands/report';

export interface AuditOptions {
  path?: string;
  profile?: string;
  json?: boolean;
}

/** Build the audit context by scanning a project, or from a stored profile. */
async function buildContext(options: AuditOptions): Promise<{ ctx: AuditContext; source: string }> {
  if (options.profile) {
    const dir = await resolveProfileDir(options.profile);
    const bundle = await loadBundle(dir);
    return {
      ctx: {
        detections: bundle.metadata.detections ?? [],
        metadata: bundle.metadata,
        tooling: bundle.tooling,
      },
      source: `profile "${bundle.profile.name}"`,
    };
  }

  const root = path.resolve(options.path ?? process.cwd());
  const scan = await scanProject(root);
  return {
    ctx: { detections: scan.detections, metadata: scan.metadata, tooling: scan.tooling },
    source: path.basename(root) || 'project',
  };
}

/**
 * `replicax audit` — score a project's setup against best-practice rules and
 * recommend what's missing. Scans the target directory by default, or evaluates a
 * stored profile's detections with `--profile`. Output goes to stdout.
 */
export async function auditCommand(options: AuditOptions): Promise<void> {
  const { ctx, source } = await buildContext(options);
  const result = runAudit(ctx);

  if (options.json) {
    logger.out(JSON.stringify(result, null, 2));
    return;
  }

  logger.out(pc.bold(`Project Score: ${result.score}/${result.maxScore}`));
  logger.out(pc.dim(`Audited ${source}`));
  logger.out('');

  for (const rule of result.rules) {
    logger.out(statusLine(rule.passed, rule.title));
  }

  if (result.missing.length === 0) {
    logger.out('');
    logger.out(pc.green('All checks passed.'));
    return;
  }

  logger.out('');
  logger.out(pc.bold('Missing:'));
  for (const item of result.missing) logger.out(`  - ${item}`);

  logger.out('');
  logger.out(pc.bold('Recommendations:'));
  for (const rec of result.recommendations) logger.out(`  - ${rec}`);
}
