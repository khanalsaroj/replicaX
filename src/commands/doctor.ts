import { runEnvironmentChecks } from '@/core/environment';
import { logger, pc } from '@/utils/logger';
import { statusLine } from '@/commands/report';

export interface DoctorOptions {
  json?: boolean;
}

/**
 * `replicax doctor` — report which developer tools are installed locally, with
 * versions. Purely informational (always exits 0); a missing tool is a finding,
 * not an error. Human output and `--json` both go to stdout (this is the result).
 */
export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const checks = await runEnvironmentChecks();

  if (options.json) {
    logger.out(JSON.stringify({ checks }, null, 2));
    return;
  }

  logger.out(pc.bold('Developer environment'));
  logger.out('');
  for (const check of checks) {
    const note = check.found ? check.version : 'not found';
    logger.out(statusLine(check.found, check.name, note));
  }

  const found = checks.filter((c) => c.found).length;
  logger.out('');
  logger.out(pc.dim(`${found}/${checks.length} tools found`));
}
