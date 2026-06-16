import { CATEGORY_BY_ID } from '@/config/supported-files';
import type { Metadata, PackageManager, Structure, Tooling } from '@/schema';
import type { RawPackageJson } from '@/core/detect';
import { slugify } from '@/utils/slug';

/**
 * Turn a project scan into an AI-assistant *skill*: a markdown document with YAML
 * frontmatter (name + description) describing the stack, the common commands, the
 * tooling, and the folder layout. This is built deterministically from what the
 * scanner already detected — it never executes anything and never invokes an AI.
 *
 * The same content is written verbatim to whichever target the user picked (see
 * `config/ai-targets.ts`); only the on-disk path varies per assistant.
 */
export interface BuildSkillArgs {
  /** Project name, used for the skill slug and description. */
  name: string;
  metadata: Metadata;
  tooling: Tooling;
  structure: Structure;
  pkg: RawPackageJson | null;
}

export interface GeneratedSkill {
  /** kebab-case slug used for the skill folder/file name. */
  slug: string;
  /** Full markdown document, including YAML frontmatter. */
  content: string;
}

/** Human-readable framework labels for the few ids that aren't self-evident. */
const FRAMEWORK_LABELS: Record<string, string> = {
  next: 'Next.js',
  nuxt: 'Nuxt',
  remix: 'Remix',
  astro: 'Astro',
  angular: 'Angular',
  sveltekit: 'SvelteKit',
  nestjs: 'NestJS',
  expo: 'Expo',
  'react-native': 'React Native',
  vue: 'Vue',
  svelte: 'Svelte',
  solid: 'SolidJS',
  react: 'React',
  fastify: 'Fastify',
  koa: 'Koa',
  express: 'Express',
  node: 'Node',
  unknown: 'unknown',
};

/** Scripts surfaced first, in this order, before any remaining ones. */
const PRIMARY_SCRIPTS = [
  'dev',
  'start',
  'build',
  'test',
  'test:watch',
  'lint',
  'format',
  'format:check',
  'typecheck',
];

/** The package manager's install command. */
function installCommand(pm: PackageManager): string {
  switch (pm) {
    case 'yarn':
      return 'yarn';
    case 'pnpm':
      return 'pnpm install';
    case 'bun':
      return 'bun install';
    default:
      return 'npm install';
  }
}

/** The package manager's "run this script" command. */
function runCommand(pm: PackageManager, script: string): string {
  switch (pm) {
    case 'yarn':
      return `yarn ${script}`;
    case 'pnpm':
      return `pnpm ${script}`;
    case 'bun':
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}

/** Order scripts: known primary ones first, then the rest alphabetically. */
function orderedScripts(scripts: Record<string, string>): string[] {
  const names = Object.keys(scripts);
  const primary = PRIMARY_SCRIPTS.filter((s) => names.includes(s));
  const rest = names.filter((s) => !PRIMARY_SCRIPTS.includes(s)).sort();
  return [...primary, ...rest];
}

/** Group captured config files by their category label → file paths. */
function toolingByCategoryLabel(tooling: Tooling): Array<[string, string[]]> {
  const groups = new Map<string, string[]>();
  for (const file of tooling.files) {
    const label = CATEGORY_BY_ID.get(file.category)?.label ?? file.category;
    const list = groups.get(label) ?? [];
    list.push(file.path);
    groups.set(label, list);
  }
  return [...groups.entries()]
    .map(([label, paths]): [string, string[]] => [label, paths.sort()])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** Top-level directories only (no nested paths), for a concise structure list. */
function topLevelDirectories(structure: Structure): string[] {
  return structure.directories.filter((d) => !d.includes('/')).sort();
}

/** Quote a string for safe use as a single-line YAML value. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Detect a representative testing tool from captured config file paths, falling
 * back to declared dependencies (a project may run Vitest/Jest with no config
 * file at all).
 */
function testingTool(tooling: Tooling, pkg: RawPackageJson | null): string | undefined {
  const haystack = [
    ...tooling.files.map((f) => f.path),
    ...Object.keys(pkg?.devDependencies ?? {}),
    ...Object.keys(pkg?.dependencies ?? {}),
  ];
  const has = (needle: string) => haystack.some((s) => s.includes(needle));
  if (has('vitest')) return 'Vitest';
  if (has('jest')) return 'Jest';
  if (has('playwright')) return 'Playwright';
  if (has('cypress')) return 'Cypress';
  return undefined;
}

/** True when any captured file belongs to the given category. */
function hasCategory(tooling: Tooling, categoryId: string): boolean {
  return tooling.files.some((f) => f.category === categoryId);
}

/** Build the conditional "Conventions" bullets from what was detected. */
function conventionLines(args: BuildSkillArgs, scripts: Record<string, string>): string[] {
  const { metadata, tooling } = args;
  const pm = metadata.packageManager;
  const has = (s: string) => s in scripts;
  const lines: string[] = [];

  if (metadata.language === 'typescript') {
    lines.push(
      has('typecheck')
        ? `Written in TypeScript — run \`${runCommand(pm, 'typecheck')}\` before committing.`
        : 'Written in TypeScript — prefer typed APIs and keep the type checker clean.',
    );
  }
  if (hasCategory(tooling, 'prettier')) {
    lines.push(
      has('format')
        ? `Formatting is handled by Prettier — run \`${runCommand(pm, 'format')}\`.`
        : 'Formatting is handled by Prettier — match the configured style.',
    );
  }
  if (hasCategory(tooling, 'eslint')) {
    lines.push(
      has('lint')
        ? `Linting via ESLint — run \`${runCommand(pm, 'lint')}\`.`
        : 'Linting via ESLint — keep the rules satisfied.',
    );
  }
  const tester = testingTool(tooling, args.pkg);
  if (tester) {
    lines.push(
      has('test')
        ? `Tests use ${tester} — run \`${runCommand(pm, 'test')}\`.`
        : `Tests use ${tester}.`,
    );
  }
  if (hasCategory(tooling, 'docker')) {
    lines.push('Containerized with Docker (see the Dockerfile / compose files).');
  }
  if (hasCategory(tooling, 'cicd')) {
    lines.push('CI is configured — keep the pipeline green before merging.');
  }
  if (hasCategory(tooling, 'husky')) {
    lines.push('Git hooks (Husky) run on commit — do not bypass them.');
  }
  lines.push('Match the existing code style and the folder layout shown above.');
  return lines;
}

/** Assemble the full skill markdown document from a project scan. */
export function buildSkill(args: BuildSkillArgs): GeneratedSkill {
  const { name, metadata, tooling, structure, pkg } = args;
  const slug = slugify(name);
  const pm = metadata.packageManager;
  const framework = FRAMEWORK_LABELS[metadata.framework] ?? metadata.framework;
  const language = metadata.language === 'typescript' ? 'TypeScript' : 'JavaScript';
  const scripts = pkg?.scripts ?? {};

  const description =
    `${name} project: ${framework}/${language} setup, build/test commands, and tooling ` +
    `conventions. Use this skill when working in or scaffolding this codebase.`;

  const lines: string[] = [];

  // --- Frontmatter -----------------------------------------------------------
  lines.push('---');
  lines.push(`name: ${slug}`);
  lines.push(`description: ${yamlString(description)}`);
  lines.push('---');
  lines.push('');

  lines.push(`# ${name}`);
  lines.push('');
  lines.push(`Setup, commands, and conventions for \`${name}\`, generated by ReplicaX.`);
  lines.push('');

  // --- Tech stack ------------------------------------------------------------
  lines.push('## Tech stack');
  lines.push('');
  lines.push(`- **Language:** ${language}`);
  lines.push(`- **Framework:** ${framework}`);
  lines.push(`- **Package manager:** ${pm}`);
  lines.push(`- **Node version:** ${metadata.nodeVersion}`);
  lines.push('');

  // --- Setup -----------------------------------------------------------------
  lines.push('## Setup');
  lines.push('');
  lines.push('Install dependencies:');
  lines.push('');
  lines.push('```bash');
  lines.push(installCommand(pm));
  lines.push('```');
  lines.push('');

  // --- Commands --------------------------------------------------------------
  const scriptNames = orderedScripts(scripts);
  if (scriptNames.length > 0) {
    lines.push('## Commands');
    lines.push('');
    for (const script of scriptNames) {
      lines.push(`- **${script}** — \`${runCommand(pm, script)}\``);
    }
    lines.push('');
  }

  // --- Tooling ---------------------------------------------------------------
  const groups = toolingByCategoryLabel(tooling);
  if (groups.length > 0) {
    lines.push('## Tooling');
    lines.push('');
    for (const [label, paths] of groups) {
      lines.push(`- **${label}:** ${paths.join(', ')}`);
    }
    lines.push('');
  }

  // --- Project structure -----------------------------------------------------
  const dirs = topLevelDirectories(structure);
  if (dirs.length > 0) {
    lines.push('## Project structure');
    lines.push('');
    lines.push('Top-level directories:');
    lines.push('');
    for (const dir of dirs) {
      lines.push(`- \`${dir}/\``);
    }
    lines.push('');
  }

  // --- Conventions -----------------------------------------------------------
  lines.push('## Conventions');
  lines.push('');
  for (const line of conventionLines(args, scripts)) {
    lines.push(`- ${line}`);
  }
  lines.push('');

  return { slug, content: lines.join('\n') };
}
