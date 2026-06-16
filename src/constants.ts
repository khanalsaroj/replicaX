/**
 * Project-wide constants for ReplicaX.
 */

/** The directory that holds a generated profile, relative to a project root. */
export const REPLICAX_DIR = '.replicax';

/** The user-authored ignore file controlling what is exported into a profile. */
export const IGNORE_FILE = '.replicaxignore';

/**
 * The schema/format version stamped into every profile we write. Evolves
 * independently of the npm package version. 2.1.0 added optional `detections`
 * (metadata), `registry` (profile), and the `manifest.json` index — all
 * backward-compatible additions (see {@link file://./core/migrations.ts}).
 */
export const REPLICAX_VERSION = '2.1.0';

/**
 * File names that make up a profile inside {@link REPLICAX_DIR}. The first five
 * are required; `manifest.json` is optional (synthesized on load when missing).
 */
export const PROFILE_FILES = {
  profile: 'profile.json',
  tooling: 'tooling.json',
  structure: 'structure.json',
  metadata: 'metadata.json',
  checksum: 'checksum.json',
  manifest: 'manifest.json',
} as const;

/** Logical keys of the five required profile files (manifest is optional). */
export const REQUIRED_PROFILE_FILE_KEYS = [
  'profile',
  'tooling',
  'structure',
  'metadata',
  'checksum',
] as const;

export type ProfileFileKey = keyof typeof PROFILE_FILES;

/**
 * Globs handed to fast-glob's `ignore` option so we never *descend* into heavy
 * or irrelevant directories. This is a performance prune, not the security
 * boundary — that lives in the ignore engine and the secret guard.
 */
export const SCAN_PRUNE_GLOBS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/.vercel/**',
  '**/.output/**',
  '**/.parcel-cache/**',
  `**/${REPLICAX_DIR}/**`,
  '**/.husky/_/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/.vs/**',
  '**/.fleet/**',
  '**/.zed/**',
];

/**
 * Default gitignore-style patterns folded into every ignore engine instance,
 * on top of whatever the user puts in {@link IGNORE_FILE}.
 */
export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  'out/',
  'coverage/',
  '.next/',
  '.nuxt/',
  '.svelte-kit/',
  '.turbo/',
  '.cache/',
  '.vercel/',
  '.output/',
  '.parcel-cache/',
  `${REPLICAX_DIR}/`,
  '.husky/_/',
  '.vscode/',
  '.idea/',
  '.vs/',
  '.fleet/',
  '.zed/',
];

/**
 * Hard security guard. Files matching any of these globs are NEVER captured
 * into a profile, regardless of ignore configuration. Enforces the PRD's
 * "never export secrets" requirement.
 */
export const SECRET_GUARD_GLOBS = [
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/*.p8',
  '**/*.cert',
  '**/*.crt',
  '**/*.keystore',
  '**/*.jks',
  '**/*.ppk',
  '**/id_rsa*',
  '**/id_dsa*',
  '**/id_ecdsa*',
  '**/id_ed25519*',
  '**/.netrc',
  '**/.pgpass',
  '**/.htpasswd',
  '**/secrets.*',
  '**/*.secret',
  '**/*.secrets',
];

/** A sensible starter {@link IGNORE_FILE} written by `init` when none exists. */
export const DEFAULT_IGNORE_FILE_CONTENTS = `# .replicaxignore — control what ReplicaX exports into a profile.
# Uses .gitignore syntax. Matched files are excluded from the profile,
# though ReplicaX may still scan them to infer project metadata.

# Business logic & application source (structure is kept, contents are not)
src/features/**
src/services/**
src/api/**
src/**/*.ts
src/**/*.tsx
src/**/*.js
src/**/*.jsx

# Secrets (also enforced unconditionally by ReplicaX)
.env
.env.*
*.pem
*.key

# Dependencies & build output
node_modules/
dist/
build/
coverage/
.next/
.nuxt/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
`;
