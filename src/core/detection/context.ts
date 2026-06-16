import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import { SCAN_PRUNE_GLOBS } from '@/constants';
import type { RawPackageJson } from '@/core/detect';
import { toPosix } from '@/utils/paths';
import type { DetectionContext } from './types';

/**
 * Assemble a {@link DetectionContext} for `root`. We probe a *fixed* set of
 * evidence (so detection cost is bounded and predictable, never a full re-walk):
 *
 *  1. exact files/dirs whose mere presence matters — checked with `fs.pathExists`
 *     in parallel (this is also why pruned dirs like `.vscode/` are still
 *     detectable: `pathExists` ignores the scanner's prune globs);
 *  2. a handful of narrow globs for variant filenames and directory contents
 *     (workflow files, `*.config.*` flavours, husky hooks, Spring resources).
 */

/** Exact files/dirs whose presence is evidence for some detector. */
const EXACT_CANDIDATES = [
  // package managers / lockfiles
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
  'pnpm-workspace.yaml',
  // docker
  'Dockerfile',
  '.dockerignore',
  // ci
  '.gitlab-ci.yml',
  '.circleci/config.yml',
  'Jenkinsfile',
  'azure-pipelines.yml',
  // monorepo / build
  'turbo.json',
  'nx.json',
  'lerna.json',
  // git hooks
  '.husky',
  // editors / ai assistants
  '.vscode',
  '.cursor',
  '.cursorrules',
  '.claude',
  'CLAUDE.md',
  '.windsurf',
  '.windsurfrules',
  '.devcontainer',
  '.devcontainer.json',
  // lint / format (exact flavours)
  '.eslintrc',
  '.prettierrc',
  // language
  'tsconfig.json',
  'jsconfig.json',
  // jvm build
  'pom.xml',
  'mvnw',
  'mvnw.cmd',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradlew',
  'gradlew.bat',
];

/** Narrow globs catching variant filenames and directory contents. */
const GLOB_CANDIDATES = [
  '.github/workflows/*.yml',
  '.github/workflows/*.yaml',
  'Dockerfile.*',
  'docker-compose*.yml',
  'docker-compose*.yaml',
  'compose.yml',
  'compose.yaml',
  'eslint.config.*',
  '.eslintrc.*',
  'prettier.config.*',
  '.prettierrc.*',
  'commitlint.config.*',
  '.commitlintrc',
  '.commitlintrc.*',
  'lint-staged.config.*',
  '.lintstagedrc',
  '.lintstagedrc.*',
  'vitest.config.*',
  'jest.config.*',
  'playwright.config.*',
  'cypress.config.*',
  '.husky/*',
  // JVM build files + Spring resources, globbed with `**/` so a backend nested
  // inside a monorepo (e.g. fullstack JS + Spring) is still detected.
  '**/pom.xml',
  '**/build.gradle',
  '**/build.gradle.kts',
  '**/settings.gradle',
  '**/settings.gradle.kts',
  '**/src/main/resources/application*.yml',
  '**/src/main/resources/application*.yaml',
  '**/src/main/resources/application*.properties',
];

/** Gather the evidence set and build a context for the detector registry. */
export async function gatherContext(
  root: string,
  pkg: RawPackageJson | null,
): Promise<DetectionContext> {
  const present = new Set<string>();

  await Promise.all(
    EXACT_CANDIDATES.map(async (rel) => {
      if (await fs.pathExists(path.join(root, rel))) present.add(rel);
    }),
  );

  const matches = await fg(GLOB_CANDIDATES, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    unique: true,
    suppressErrors: true,
    followSymbolicLinks: false,
    ignore: SCAN_PRUNE_GLOBS,
  });
  for (const m of matches) present.add(toPosix(m));

  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };

  return {
    root,
    pkg,
    deps,
    present,
    has: (rel) => present.has(rel),
    hasUnder: (prefix) => {
      const p = prefix.replace(/\/+$/, '');
      if (present.has(p)) return true;
      const needle = `${p}/`;
      for (const x of present) if (x.startsWith(needle)) return true;
      return false;
    },
    hasDep: (name) => name in deps,
  };
}
