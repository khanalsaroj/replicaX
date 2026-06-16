import type { Detection, Metadata, Tooling } from '@/schema';

/**
 * The rule-based audit engine's inputs and rule shape. Rules are **pure
 * predicates over an {@link AuditContext}** (which is driven by the detection
 * layer), so the engine is deterministic and each rule is unit-testable in
 * isolation. Adding a check is one array entry in {@link AUDIT_RULES}.
 */
export interface AuditContext {
  detections: Detection[];
  metadata: Metadata;
  tooling: Tooling;
}

export interface AuditRule {
  id: string;
  title: string;
  /** Relative importance; contributes to the weighted score. */
  weight: number;
  /** Grouping label (e.g. "quality", "delivery"). */
  category: string;
  passes(ctx: AuditContext): boolean;
  /** Shown when the rule fails. */
  recommendation: string;
}

/** True when any of `ids` was detected in the project. */
function detected(ctx: AuditContext, ids: string[]): boolean {
  const present = new Set(ctx.detections.map((d) => d.id));
  return ids.some((id) => present.has(id));
}

/**
 * The default rule set. Weights sum to 100 so a pristine project scores 100, but
 * the engine normalizes regardless — weights are relative, not absolute.
 */
export const AUDIT_RULES: AuditRule[] = [
  {
    id: 'linting',
    title: 'Linting',
    weight: 15,
    category: 'quality',
    passes: (c) => detected(c, ['eslint', 'biome']),
    recommendation: 'Add ESLint to catch problems with static analysis.',
  },
  {
    id: 'formatting',
    title: 'Formatting',
    weight: 10,
    category: 'quality',
    passes: (c) => detected(c, ['prettier', 'biome']),
    recommendation: 'Add Prettier to keep formatting consistent.',
  },
  {
    id: 'testing',
    title: 'Testing',
    weight: 20,
    category: 'quality',
    passes: (c) => detected(c, ['vitest', 'jest', 'playwright', 'cypress']),
    recommendation: 'Add a test runner such as Vitest or Jest.',
  },
  {
    id: 'git-hooks',
    title: 'Git hooks',
    weight: 10,
    category: 'quality',
    passes: (c) => detected(c, ['husky', 'lefthook']),
    recommendation: 'Add Husky to run checks before each commit.',
  },
  {
    id: 'ci',
    title: 'CI/CD',
    weight: 20,
    category: 'delivery',
    passes: (c) =>
      detected(c, ['github-actions', 'gitlab-ci', 'circleci', 'jenkins', 'azure-pipelines']),
    recommendation: 'Add a CI pipeline (e.g. GitHub Actions) to run checks on every push.',
  },
  {
    id: 'containerization',
    title: 'Containerization',
    weight: 10,
    category: 'delivery',
    passes: (c) => detected(c, ['docker', 'docker-compose']),
    recommendation: 'Add a Dockerfile to containerize the application.',
  },
  {
    id: 'typescript',
    title: 'TypeScript',
    weight: 10,
    category: 'quality',
    passes: (c) => detected(c, ['typescript']),
    recommendation: 'Adopt TypeScript for type safety.',
  },
  {
    id: 'commit-linting',
    title: 'Commit linting',
    weight: 3,
    category: 'quality',
    passes: (c) => detected(c, ['commitlint']),
    recommendation: 'Add Commitlint to standardize commit messages.',
  },
  {
    id: 'staged-linting',
    title: 'Staged-file linting',
    weight: 2,
    category: 'quality',
    passes: (c) => detected(c, ['lint-staged']),
    recommendation: 'Add lint-staged to lint only changed files.',
  },
];
