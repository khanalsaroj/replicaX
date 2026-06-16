#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { ReplicaxError } from '@/utils/errors';
import { isVerbose, logger } from '@/utils/logger';
import { initCommand } from '@/commands/init';
import { initSkillCommand } from '@/commands/init-skill';
import { extractCommand } from '@/commands/extract';
import { createCommand } from '@/commands/create';
import { SKILL_TARGET_IDS } from '@/config/ai-targets';
import { syncCommand } from '@/commands/sync';
import { inspectCommand } from '@/commands/inspect';
import { validateCommand } from '@/commands/validate';
import { exportCommand } from '@/commands/export';
import { importCommand } from '@/commands/import';
import { doctorCommand } from '@/commands/doctor';
import { compareCommand } from '@/commands/compare';
import { auditCommand } from '@/commands/audit';

/**
 * The CLI version is the published npm package version, read from package.json at
 * runtime (it sits one level up from this file in both `dist/` and `src/`). This
 * is deliberately *not* {@link REPLICAX_VERSION}, which is the profile schema
 * version and evolves independently of releases.
 */
function packageVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Wrap a command action so every failure is reported consistently. */
function action<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A): Promise<void> => {
    try {
      await fn(...args);
    } catch (err) {
      handleError(err);
    }
  };
}

function handleError(err: unknown): void {
  if (err instanceof ReplicaxError) {
    logger.error(err.message);
    for (const hint of err.hints) logger.hint(hint);
  } else if (err instanceof Error && err.name === 'ExitPromptError') {
    // User pressed Ctrl+C at an interactive prompt.
    logger.newline();
    logger.warn('Cancelled.');
  } else if (err instanceof Error) {
    logger.error(err.message);
    if (isVerbose() && err.stack) logger.hint(err.stack);
  } else {
    logger.error(String(err));
  }
  process.exitCode = 1;
}

const program = new Command();

program
  .name('replicax')
  .description('Copy the setup, not the code.')
  .version(packageVersion(), '-v, --version', 'Print the ReplicaX version')
  .showHelpAfterError('(run `replicax --help` for usage)');

program
  .command('init')
  .description('Scan the current project and create a ReplicaX profile in .replicax/')
  .option('--name <name>', 'Name the profile')
  .option('--dry-run', 'Preview what would be captured without writing')
  .option('--verbose', 'Show every detected file')
  .action(action(initCommand));

program
  .command('init-skill')
  .description(
    'Generate an AI assistant skill from the detected tech stack (uses your configured AI)',
  )
  .option('--target <ai>', `Target AI assistant: ${SKILL_TARGET_IDS.join('|')}`)
  .option('--name <name>', 'Name the skill (defaults to the project folder name)')
  .option('--provider <ai>', 'Force the AI provider: claude|openai|gemini (default: auto-detect)')
  .option('--model <id>', 'Override the API model id for the chosen provider')
  .option('--no-ai', 'Skip the AI provider and use the built-in deterministic template')
  .option('--dry-run', 'Preview the skill without writing (no AI call)')
  .option('--force', 'Overwrite existing skill files')
  .option('--verbose', 'Show every detected file')
  .action(action(initSkillCommand));

program
  .command('extract')
  .argument('<repo>', 'GitHub repo: owner/repo, a github.com URL, or owner/repo#branch')
  .description('Extract a ReplicaX profile from a remote GitHub repository')
  .option('--ref <ref>', 'Branch, tag, or commit to fetch (default: the repo default branch)')
  .option('--name <name>', 'Name the profile (defaults to the repo name)')
  .option('--out <dir>', 'Directory to write the .replicax profile into (default: current dir)')
  .option('--dry-run', 'Preview what would be captured without writing')
  .option('--verbose', 'Show every detected file')
  .action(action(extractCommand));

program
  .command('create')
  .argument('<project-name>', 'Directory/name for the new project')
  .description('Create a new project from a profile')
  .option('--profile <path>', 'Use a profile from a custom path')
  .option('--skip-install', 'Do not run the package manager install step')
  .option('--dry-run', 'Preview the output without writing')
  .option('--force', 'Overwrite conflicting files without prompting')
  .option('--verbose', 'Show every written file')
  .action(action(createCommand));

program
  .command('sync')
  .description('Update the profile from the current project state')
  .option('--diff', 'Show a detailed list of what changed')
  .option('--force', 'Rewrite the profile even if nothing changed')
  .option('--verbose', 'Show every detected file')
  .action(action(syncCommand));

program
  .command('inspect')
  .description('Display captured configuration and structure')
  .option('--json', 'Output as JSON')
  .option('--section <section>', 'Inspect one section: profile|tooling|structure|metadata')
  .option('--profile <path>', 'Inspect a profile at a custom path')
  .action(action(inspectCommand));

program
  .command('validate')
  .description('Check profile schema and integrity')
  .option('--profile <path>', 'Validate a profile at a custom path')
  .action(action(validateCommand));

program
  .command('export')
  .description('Export the profile as a portable .tar.gz archive')
  .option('--out <file>', 'Output archive path')
  .option('--profile <path>', 'Export a profile from a custom path')
  .action(action(exportCommand));

program
  .command('import')
  .argument('<archive>', 'Path to a .tar.gz profile archive')
  .description('Import a portable profile archive into .replicax/')
  .option('--force', 'Overwrite an existing profile')
  .action(action(importCommand));

program
  .command('doctor')
  .description('Check which developer tools are installed locally')
  .option('--json', 'Output as JSON')
  .action(action(doctorCommand));

program
  .command('compare')
  .argument('<source>', 'A profile path or project directory')
  .argument('<target>', 'A profile path or project directory')
  .description('Compare two profiles (or projects): tooling, config, structure, metadata')
  .option('--json', 'Output as JSON')
  .action(action(compareCommand));

program
  .command('audit')
  .description('Score a project setup against best practices and recommend improvements')
  .option('--path <dir>', 'Directory to audit (default: current dir)')
  .option('--profile <path>', 'Audit a stored profile instead of scanning')
  .option('--json', 'Output as JSON')
  .action(action(auditCommand));

if (process.argv.slice(2).length === 0) {
  program.outputHelp();
  process.exit(0);
}

program.parseAsync(process.argv).catch(handleError);
