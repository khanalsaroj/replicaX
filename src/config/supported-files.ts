/**
 * The catalogue of configuration files ReplicaX knows how to capture, grouped
 * into categories. Patterns are fast-glob globs evaluated from the project root.
 *
 * Both `.ts` and `.js` (and `.mjs`/`.cjs`) variants are covered via `*` globs,
 * which is the whole point: ReplicaX copies these files verbatim, so it never
 * needs to compile or execute a `.ts` config to support it.
 */
export interface ConfigCategory {
  /** Stable identifier used in tooling.json and inspect output. */
  id: string;
  /** Human-friendly label for display. */
  label: string;
  /** fast-glob patterns, relative to the project root. */
  patterns: string[];
}

export const CONFIG_CATEGORIES: ConfigCategory[] = [
  {
    id: 'typescript',
    label: 'Language & Type Checking',
    patterns: ['tsconfig.json', 'tsconfig.*.json', 'jsconfig.json'],
  },
  {
    id: 'prettier',
    label: 'Formatting',
    patterns: ['.prettierrc', '.prettierrc.*', 'prettier.config.*', '.prettierignore'],
  },
  {
    id: 'eslint',
    label: 'Linting',
    patterns: ['eslint.config.*', '.eslintrc', '.eslintrc.*', '.eslintignore'],
  },
  {
    id: 'build',
    label: 'Build Tools',
    patterns: [
      'vite.config.*',
      'webpack.config.*',
      'rollup.config.*',
      'esbuild.config.*',
      'turbo.json',
    ],
  },
  {
    id: 'styling',
    label: 'Styling',
    patterns: ['tailwind.config.*', 'postcss.config.*'],
  },
  {
    id: 'package',
    label: 'Package Management & Monorepos',
    patterns: [
      // package.json is handled specially (curated template), not here.
      'pnpm-workspace.yaml',
      'nx.json',
      'lerna.json',
      '.npmrc',
      '.nvmrc',
      '.node-version',
    ],
  },
  {
    id: 'docker',
    label: 'Docker',
    patterns: [
      'Dockerfile',
      'Dockerfile.*',
      'docker-compose.yml',
      'docker-compose.yaml',
      'docker-compose.*.yml',
      'docker-compose.*',
      'compose.yml',
      'compose.yaml',
      '.dockerignore',
    ],
  },
  {
    id: 'git',
    label: 'Git',
    patterns: ['.gitignore', '.gitattributes', '.gitmessage'],
  },
  {
    id: 'editor',
    label: 'Editor',
    // Only the portable, cross-editor `.editorconfig` is captured. IDE-specific
    // folders (`.vscode/`, `.idea/`, …) are intentionally excluded — see the IDE
    // entries in DEFAULT_IGNORE_PATTERNS / SCAN_PRUNE_GLOBS.
    patterns: ['.editorconfig'],
  },
  {
    id: 'testing',
    label: 'Testing',
    patterns: [
      'vitest.config.*',
      'vitest.workspace.*',
      'jest.config.*',
      'jest.setup.*',
      'playwright.config.*',
      'cypress.config.*',
    ],
  },
  {
    id: 'cicd',
    label: 'CI/CD',
    patterns: [
      '.github/workflows/*.yml',
      '.github/workflows/*.yaml',
      '.gitlab-ci.yml',
      '.circleci/config.yml',
      'Jenkinsfile',
      'azure-pipelines.yml',
    ],
  },
  {
    id: 'husky',
    label: 'Git Hooks',
    patterns: ['.husky/*'],
  },
  {
    id: 'jvm-build',
    label: 'JVM Build',
    // The captured surface is language-agnostic: Maven/Gradle build files are
    // setup, not application code. Globbed with `**/` so monorepos (a Spring
    // backend beside a JS frontend) are captured too. The gradle wrapper JAR is
    // binary and deliberately excluded — only its text `.properties` is kept.
    patterns: [
      '**/pom.xml',
      '**/build.gradle',
      '**/build.gradle.kts',
      '**/settings.gradle',
      '**/settings.gradle.kts',
      'gradle.properties',
      'mvnw',
      'mvnw.cmd',
      'gradlew',
      'gradlew.bat',
      '**/gradle/wrapper/gradle-wrapper.properties',
    ],
  },
  {
    id: 'jvm-config',
    label: 'JVM Config',
    // Spring-style externalized config. Scoped to `src/main/resources/` so we
    // capture application config without sweeping up unrelated `.properties`.
    patterns: [
      '**/src/main/resources/application*.yml',
      '**/src/main/resources/application*.yaml',
      '**/src/main/resources/application*.properties',
    ],
  },
  {
    id: 'misc',
    label: 'Miscellaneous Tooling',
    patterns: [
      'commitlint.config.*',
      'lint-staged.config.*',
      '.lintstagedrc',
      '.lintstagedrc.*',
      'release.config.*',
      '.releaserc',
      '.releaserc.*',
      'knip.config.*',
      'knip.json',
      'renovate.json',
      '.czrc',
    ],
  },
];

/** All glob patterns across every category, flattened. */
export const ALL_CONFIG_PATTERNS: string[] = CONFIG_CATEGORIES.flatMap((c) => c.patterns);

/** Map from category id to its definition, for quick lookup. */
export const CATEGORY_BY_ID = new Map(CONFIG_CATEGORIES.map((c) => [c.id, c]));

/** Labels for categories that aren't part of the glob catalogue. */
const EXTRA_CATEGORY_LABELS: Record<string, string> = {
  // Files pulled in explicitly via `.replicaxinclude`.
  included: 'Included files',
};

/** Human-friendly label for a tooling category id, falling back to the id. */
export function categoryLabel(id: string): string {
  return CATEGORY_BY_ID.get(id)?.label ?? EXTRA_CATEGORY_LABELS[id] ?? id;
}
