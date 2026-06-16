import { Confidence, defineDetector, hit, type DetectionContext, type Detector } from '../types';

/** First present path matching `re`, or undefined. */
function match(ctx: DetectionContext, re: RegExp): string | undefined {
  for (const p of ctx.present) if (re.test(p)) return p;
  return undefined;
}

/** Whether `package.json` carries a given top-level config block. */
function hasPkgKey(ctx: DetectionContext, key: string): boolean {
  return Boolean(ctx.pkg && typeof ctx.pkg === 'object' && key in ctx.pkg);
}

export const toolingDetectors: Detector[] = [
  // --- Containers ----------------------------------------------------------
  defineDetector({ id: 'docker', name: 'Docker', category: 'container' }, (ctx) => {
    const dockerfile = ctx.has('Dockerfile') ? 'Dockerfile' : match(ctx, /^Dockerfile(\.|$)/);
    if (dockerfile) return hit(Confidence.Confirmed, dockerfile);
    if (ctx.has('.dockerignore')) return hit(Confidence.Likely, '.dockerignore');
    return null;
  }),
  defineDetector({ id: 'docker-compose', name: 'Docker Compose', category: 'container' }, (ctx) => {
    const compose = match(ctx, /^(docker-compose|compose).*\.ya?ml$/);
    return compose ? hit(Confidence.Confirmed, compose) : null;
  }),

  // --- CI/CD ---------------------------------------------------------------
  defineDetector({ id: 'github-actions', name: 'GitHub Actions', category: 'ci' }, (ctx) => {
    if (ctx.hasUnder('.github/workflows')) {
      return hit(
        Confidence.Confirmed,
        match(ctx, /^\.github\/workflows\//) ?? '.github/workflows/',
      );
    }
    return null;
  }),
  defineDetector({ id: 'gitlab-ci', name: 'GitLab CI', category: 'ci' }, (ctx) =>
    ctx.has('.gitlab-ci.yml') ? hit(Confidence.Confirmed, '.gitlab-ci.yml') : null,
  ),
  defineDetector({ id: 'circleci', name: 'CircleCI', category: 'ci' }, (ctx) =>
    ctx.has('.circleci/config.yml') ? hit(Confidence.Confirmed, '.circleci/config.yml') : null,
  ),
  defineDetector({ id: 'jenkins', name: 'Jenkins', category: 'ci' }, (ctx) =>
    ctx.has('Jenkinsfile') ? hit(Confidence.Confirmed, 'Jenkinsfile') : null,
  ),
  defineDetector({ id: 'azure-pipelines', name: 'Azure Pipelines', category: 'ci' }, (ctx) =>
    ctx.has('azure-pipelines.yml') ? hit(Confidence.Confirmed, 'azure-pipelines.yml') : null,
  ),

  // --- Monorepo ------------------------------------------------------------
  defineDetector({ id: 'turborepo', name: 'Turborepo', category: 'monorepo' }, (ctx) =>
    ctx.has('turbo.json') ? hit(Confidence.Confirmed, 'turbo.json') : null,
  ),
  defineDetector({ id: 'nx', name: 'Nx', category: 'monorepo' }, (ctx) =>
    ctx.has('nx.json') ? hit(Confidence.Confirmed, 'nx.json') : null,
  ),

  // --- Git hooks / commit --------------------------------------------------
  defineDetector({ id: 'husky', name: 'Husky', category: 'git-hooks' }, (ctx) => {
    if (ctx.hasUnder('.husky')) return hit(Confidence.Confirmed, '.husky/');
    if (ctx.hasDep('husky')) return hit(Confidence.Strong, 'package.json#husky');
    return null;
  }),
  defineDetector({ id: 'lint-staged', name: 'lint-staged', category: 'commit' }, (ctx) => {
    const cfg = match(ctx, /^(lint-staged\.config\.|\.lintstagedrc)/);
    if (cfg) return hit(Confidence.Confirmed, cfg);
    if (hasPkgKey(ctx, 'lint-staged') || hasPkgKey(ctx, 'nano-staged')) {
      return hit(Confidence.Confirmed, 'package.json#lint-staged');
    }
    if (ctx.hasDep('lint-staged')) return hit(Confidence.Strong, 'package.json#lint-staged');
    return null;
  }),
  defineDetector({ id: 'commitlint', name: 'Commitlint', category: 'commit' }, (ctx) => {
    const cfg = match(ctx, /^(commitlint\.config\.|\.commitlintrc)/);
    if (cfg) return hit(Confidence.Confirmed, cfg);
    if (hasPkgKey(ctx, 'commitlint')) return hit(Confidence.Confirmed, 'package.json#commitlint');
    if (ctx.hasDep('@commitlint/cli')) return hit(Confidence.Strong, '@commitlint/cli');
    return null;
  }),

  // --- Lint / format -------------------------------------------------------
  defineDetector({ id: 'eslint', name: 'ESLint', category: 'lint' }, (ctx) => {
    const cfg = ctx.has('.eslintrc') ? '.eslintrc' : match(ctx, /^(eslint\.config\.|\.eslintrc\.)/);
    if (cfg) return hit(Confidence.Confirmed, cfg);
    if (hasPkgKey(ctx, 'eslintConfig'))
      return hit(Confidence.Confirmed, 'package.json#eslintConfig');
    if (ctx.hasDep('eslint')) return hit(Confidence.Strong, 'eslint');
    return null;
  }),
  defineDetector({ id: 'prettier', name: 'Prettier', category: 'format' }, (ctx) => {
    const cfg = ctx.has('.prettierrc')
      ? '.prettierrc'
      : match(ctx, /^(prettier\.config\.|\.prettierrc\.)/);
    if (cfg) return hit(Confidence.Confirmed, cfg);
    if (hasPkgKey(ctx, 'prettier')) return hit(Confidence.Confirmed, 'package.json#prettier');
    if (ctx.hasDep('prettier')) return hit(Confidence.Strong, 'prettier');
    return null;
  }),

  // --- Testing -------------------------------------------------------------
  defineDetector({ id: 'vitest', name: 'Vitest', category: 'test' }, (ctx) => {
    const cfg = match(ctx, /^vitest\.config\./);
    if (cfg) return hit(Confidence.Confirmed, cfg);
    if (ctx.hasDep('vitest')) return hit(Confidence.Strong, 'vitest');
    return null;
  }),
  defineDetector({ id: 'jest', name: 'Jest', category: 'test' }, (ctx) => {
    const cfg = match(ctx, /^jest\.config\./);
    if (cfg) return hit(Confidence.Confirmed, cfg);
    if (hasPkgKey(ctx, 'jest')) return hit(Confidence.Confirmed, 'package.json#jest');
    if (ctx.hasDep('jest')) return hit(Confidence.Strong, 'jest');
    return null;
  }),
  defineDetector({ id: 'playwright', name: 'Playwright', category: 'test' }, (ctx) => {
    const cfg = match(ctx, /^playwright\.config\./);
    if (cfg) return hit(Confidence.Confirmed, cfg);
    if (ctx.hasDep('@playwright/test') || ctx.hasDep('playwright')) {
      return hit(Confidence.Strong, 'playwright');
    }
    return null;
  }),
  defineDetector({ id: 'cypress', name: 'Cypress', category: 'test' }, (ctx) => {
    const cfg = match(ctx, /^cypress\.config\./);
    if (cfg) return hit(Confidence.Confirmed, cfg);
    if (ctx.hasDep('cypress')) return hit(Confidence.Strong, 'cypress');
    return null;
  }),

  // --- Dev containers ------------------------------------------------------
  defineDetector({ id: 'devcontainer', name: 'Dev Container', category: 'devcontainer' }, (ctx) => {
    if (ctx.hasUnder('.devcontainer')) return hit(Confidence.Confirmed, '.devcontainer/');
    if (ctx.has('.devcontainer.json')) return hit(Confidence.Confirmed, '.devcontainer.json');
    return null;
  }),
];
