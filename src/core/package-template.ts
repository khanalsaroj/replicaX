import type { PackageTemplate } from '@/schema';
import type { RawPackageJson } from '@/core/detect';

/**
 * package.json gets special treatment. Per the PRD we capture only
 * setup-relevant fields — scripts, devDependencies, engines, the module type,
 * the pinned package manager, plus any tool-config blocks that conventionally
 * live in package.json. Runtime `dependencies` are deliberately dropped: those
 * are application code, not setup.
 */

/** Config blocks that legitimately live inside package.json and are setup, not code. */
const PASSTHROUGH_CONFIG_KEYS = [
  'lint-staged',
  'nano-staged',
  'prettier',
  'eslintConfig',
  'commitlint',
  'release',
  'husky',
  'browserslist',
  'c8',
  'jest',
];

function nonEmptyRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => typeof v === 'string',
  ) as Array<[string, string]>;
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Distill a raw package.json into the curated, setup-only template. */
export function buildPackageTemplate(pkg: RawPackageJson | null): PackageTemplate | undefined {
  if (!pkg) return undefined;
  const template: PackageTemplate = {};

  if (typeof pkg.type === 'string') template.type = pkg.type;
  if (typeof pkg.packageManager === 'string') template.packageManager = pkg.packageManager;

  const scripts = nonEmptyRecord(pkg.scripts);
  if (scripts) template.scripts = scripts;
  const devDependencies = nonEmptyRecord(pkg.devDependencies);
  if (devDependencies) template.devDependencies = devDependencies;
  const engines = nonEmptyRecord(pkg.engines);
  if (engines) template.engines = engines;

  const config: Record<string, unknown> = {};
  for (const key of PASSTHROUGH_CONFIG_KEYS) {
    if (key in pkg && pkg[key] !== undefined) config[key] = pkg[key];
  }
  if (Object.keys(config).length) template.config = config;

  return template;
}

/** Recursively key-sorted JSON — a stable representation for hashing. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Canonical form of the template used solely for checksum stability. */
export function canonicalPackageJson(template: PackageTemplate): string {
  return stableStringify(template);
}

/**
 * Render the package.json written into a freshly created project: the template
 * stamped with the new project's name and an ordered, pretty-printed layout.
 */
export function renderPackageJson(template: PackageTemplate, projectName: string): string {
  const ordered: Record<string, unknown> = {
    name: projectName,
    version: '0.1.0',
    private: true,
  };
  if (template.type) ordered.type = template.type;
  if (template.packageManager) ordered.packageManager = template.packageManager;
  if (template.engines) ordered.engines = template.engines;
  if (template.scripts) ordered.scripts = template.scripts;
  for (const [key, value] of Object.entries(template.config ?? {})) {
    ordered[key] = value;
  }
  if (template.devDependencies) ordered.devDependencies = template.devDependencies;

  return JSON.stringify(ordered, null, 2) + '\n';
}
