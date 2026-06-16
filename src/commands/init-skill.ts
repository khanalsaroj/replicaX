import path from 'node:path';
import fs from 'fs-extra';
import ora from 'ora';
import { ROOT_SKILL_FILE } from '@/constants';
import { SKILL_TARGET_BY_ID, SKILL_TARGET_IDS } from '@/config/ai-targets';
import { scanProject } from '@/core/scanner';
import { buildSkill } from '@/core/skill-generator';
import { resolveProvider } from '@/core/ai/providers';
import { buildSkillPrompt } from '@/core/ai/prompt';
import { parseSkillBundle, type SkillFile } from '@/core/ai/bundle';
import { ReplicaxError } from '@/utils/errors';
import { logger, setVerbose } from '@/utils/logger';
import { relPosix, safeJoinable } from '@/utils/paths';
import { reportSkippedSecrets } from '@/commands/report';

export interface InitSkillOptions {
  target?: string;
  name?: string;
  provider?: string;
  model?: string;
  ai?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  force?: boolean;
}

export async function initSkillCommand(options: InitSkillOptions): Promise<void> {
  if (options.verbose) setVerbose(true);

  const targetId = options.target?.toLowerCase();
  if (!targetId) {
    throw new ReplicaxError('Missing --target.', [
      `Choose an AI assistant: ${SKILL_TARGET_IDS.join(', ')}.`,
      'Example: replicax init-skill --target codex',
    ]);
  }
  const target = SKILL_TARGET_BY_ID.get(targetId);
  if (!target) {
    throw new ReplicaxError(`Unknown target "${options.target}".`, [
      `Valid targets: ${SKILL_TARGET_IDS.join(', ')}.`,
    ]);
  }

  const root = process.cwd();

  const spinner = ora({ text: 'Scanning project…', isEnabled: !options.verbose }).start();
  const scan = await scanProject(root);
  spinner.succeed(
    `Scanned ${scan.tooling.files.length} config file(s) and ${scan.structure.directories.length} director(ies)`,
  );

  // An optional project-root SKILL.md is the user's preferred template; when
  // present we hand it to the AI as the base to refine (read here, used below).
  const rootSkillPath = path.join(root, ROOT_SKILL_FILE);
  const rootSkill = (await fs.pathExists(rootSkillPath))
    ? await fs.readFile(rootSkillPath, 'utf8')
    : undefined;

  const name = options.name ?? scan.structure.root;
  // The deterministic skill is both the offline fallback and the ground-truth
  // analysis we hand to the AI to refine.
  const seed = buildSkill({
    name,
    metadata: scan.metadata,
    tooling: scan.tooling,
    structure: scan.structure,
    pkg: scan.pkg,
  });

  reportSkippedSecrets(scan.skippedSecrets);

  const entryRel = target.entryPath(seed.slug); // POSIX, e.g. .codex/skills/<slug>/SKILL.md
  const entryFile = entryRel.split('/').pop() as string;
  const bundleRoot = entryRel.slice(0, entryRel.length - entryFile.length).replace(/\/$/, '');

  logger.newline();
  logger.info(`${target.label} skill → ${entryRel}`);

  // Dry run never calls an external provider — preview the deterministic skill.
  if (options.dryRun) {
    logger.newline();
    logger.out(seed.content);
    logger.newline();
    logger.info('Dry run — no files were written and no AI provider was contacted.');
    return;
  }

  let files: SkillFile[] | null = null;
  let via = 'built-in template';

  if (options.ai !== false) {
    const provider = await resolveProvider(options.provider, options.model);
    if (provider) {
      logger.info(`Generating with ${provider.via} (sending project setup only)…`);
      if (rootSkill?.trim()) logger.info(`Using ${ROOT_SKILL_FILE} as the skill template.`);
      const aiSpinner = ora({ text: 'Authoring skill…', isEnabled: !options.verbose }).start();
      try {
        const prompt = buildSkillPrompt({
          slug: seed.slug,
          entryFile,
          entryPath: entryRel,
          target,
          analysis: seed.content,
          toolingPaths: scan.tooling.files.map((f) => f.path),
          scripts: scan.pkg?.scripts ?? {},
          rootSkill,
        });
        const raw = await provider.run(prompt);
        const parsed = parseSkillBundle(raw);
        if (parsed && parsed.some((f) => (f.path.split('/').pop() ?? '') === entryFile)) {
          files = parsed;
          via = provider.via;
          aiSpinner.succeed(`Authored ${parsed.length} file(s) with ${provider.via}`);
        } else {
          aiSpinner.fail('AI output was not a usable skill bundle');
          logger.warn('Falling back to the built-in template.');
        }
      } catch (err) {
        aiSpinner.fail('AI generation failed');
        logger.warn(`${(err as Error).message}. Falling back to the built-in template.`);
      }
    } else {
      logger.info('No configured AI provider found — using the built-in template.');
      logger.hint(
        'For AI-authored skills, install the Claude/Codex/Gemini CLI or set ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY.',
      );
    }
  }

  if (!files) {
    files = [{ path: entryFile, content: seed.content }];
  }

  // Resolve each bundle file to an absolute, traversal-safe path under bundleRoot.
  const planned = files.map((f) => {
    const rel = bundleRoot ? `${bundleRoot}/${f.path}` : f.path;
    const safe = safeJoinable(rel);
    if (!safe) {
      throw new ReplicaxError(`Refusing to write unsafe skill path: ${f.path}`);
    }
    return { rel: safe, abs: path.join(root, ...safe.split('/')), content: f.content };
  });

  const conflicts = [];
  for (const file of planned) {
    if (await fs.pathExists(file.abs)) conflicts.push(file.rel);
  }
  if (conflicts.length > 0 && !options.force) {
    throw new ReplicaxError(
      `${conflicts.length} skill file(s) already exist: ${conflicts.join(', ')}.`,
      ['Re-run with --force to overwrite them.'],
    );
  }

  for (const file of planned) {
    await fs.ensureDir(path.dirname(file.abs));
    await fs.writeFile(file.abs, file.content, 'utf8');
    logger.detail(`wrote: ${file.rel}`);
  }

  logger.newline();
  logger.success(`Skill "${seed.slug}" written (${planned.length} file(s), via ${via})`);
  logger.hint(
    `Location: ${relPosix(root, path.join(root, ...(bundleRoot || entryFile).split('/')))}`,
  );
  logger.hint(target.note);
}
