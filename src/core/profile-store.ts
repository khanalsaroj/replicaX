import path from 'node:path';
import fs from 'fs-extra';
import { z } from 'zod';
import { PROFILE_FILES, REPLICAX_DIR } from '@/constants';
import {
  ChecksumSchema,
  ManifestSchema,
  MetadataSchema,
  ProfileSchema,
  StructureSchema,
  ToolingSchema,
  type ProfileBundle,
} from '@/schema';
import { migrateRawBundle, type RawProfileFiles } from '@/core/migrations';
import { buildManifest } from '@/core/manifest';
import { ReplicaxError } from '@/utils/errors';

/** Absolute path to the `.replicax` directory for a given project root. */
export function profileDir(root: string): string {
  return path.join(path.resolve(root), REPLICAX_DIR);
}

/** Whether a usable profile (at minimum profile.json) exists in `dir`. */
export async function profileExists(dir: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, PROFILE_FILES.profile));
}

/**
 * Resolve a user-supplied `--profile` path to the actual `.replicax` directory.
 * Accepts the `.replicax` dir itself, a project root containing one, or a
 * directory that simply holds the profile JSON files.
 */
export async function resolveProfileDir(input: string): Promise<string> {
  const resolved = path.resolve(input);
  if (!(await fs.pathExists(resolved))) {
    throw new ReplicaxError(`Profile path not found: ${input}`);
  }
  if (await profileExists(resolved)) return resolved;

  const nested = path.join(resolved, REPLICAX_DIR);
  if (await profileExists(nested)) return nested;

  throw new ReplicaxError(`No ReplicaX profile found at: ${input}`, [
    `Looked for ${PROFILE_FILES.profile} in ${resolved} and ${nested}.`,
    'Run `replicax init` in the source project first.',
  ]);
}

/** Write a profile bundle to `dir`, creating it if necessary. */
export async function saveBundle(dir: string, bundle: ProfileBundle): Promise<void> {
  await fs.ensureDir(dir);
  const manifest = bundle.manifest ?? buildManifest(bundle.tooling, bundle.checksum);
  await Promise.all([
    fs.writeJson(path.join(dir, PROFILE_FILES.profile), bundle.profile, { spaces: 2 }),
    fs.writeJson(path.join(dir, PROFILE_FILES.tooling), bundle.tooling, { spaces: 2 }),
    fs.writeJson(path.join(dir, PROFILE_FILES.structure), bundle.structure, { spaces: 2 }),
    fs.writeJson(path.join(dir, PROFILE_FILES.metadata), bundle.metadata, { spaces: 2 }),
    fs.writeJson(path.join(dir, PROFILE_FILES.checksum), bundle.checksum, { spaces: 2 }),
    fs.writeJson(path.join(dir, PROFILE_FILES.manifest), manifest, { spaces: 2 }),
  ]);
}

/** Read one required profile file as raw JSON (no schema validation yet). */
async function readRawFile(dir: string, file: string): Promise<Record<string, unknown>> {
  const full = path.join(dir, file);
  if (!(await fs.pathExists(full))) {
    throw new ReplicaxError(`Profile is missing ${file}`, [`Expected at ${full}.`]);
  }
  try {
    return (await fs.readJson(full)) as Record<string, unknown>;
  } catch {
    throw new ReplicaxError(`Profile file ${file} is not valid JSON`, [`Path: ${full}`]);
  }
}

/** Validate already-read raw JSON against its schema, with friendly errors. */
function parseFile<T>(file: string, schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ReplicaxError(`Profile file ${file} failed validation`, issues);
  }
  return result.data;
}

/**
 * Load and validate a complete profile bundle from `dir`. Older profiles are
 * migrated forward (see {@link migrateRawBundle}) before validation, and the
 * optional `manifest.json` is synthesized when absent — so a profile written by
 * an earlier ReplicaX still loads cleanly.
 */
export async function loadBundle(dir: string): Promise<ProfileBundle> {
  if (!(await profileExists(dir))) {
    throw new ReplicaxError(`No ReplicaX profile found in ${dir}`, [
      'Run `replicax init` to create one.',
    ]);
  }

  const rawFiles: RawProfileFiles = {
    profile: await readRawFile(dir, PROFILE_FILES.profile),
    tooling: await readRawFile(dir, PROFILE_FILES.tooling),
    structure: await readRawFile(dir, PROFILE_FILES.structure),
    metadata: await readRawFile(dir, PROFILE_FILES.metadata),
    checksum: await readRawFile(dir, PROFILE_FILES.checksum),
  };

  const detectedVersion =
    typeof rawFiles.profile.replicaxVersion === 'string'
      ? rawFiles.profile.replicaxVersion
      : '2.0.0';
  const { raw } = migrateRawBundle(rawFiles, detectedVersion);

  const profile = parseFile(PROFILE_FILES.profile, ProfileSchema, raw.profile);
  const tooling = parseFile(PROFILE_FILES.tooling, ToolingSchema, raw.tooling);
  const structure = parseFile(PROFILE_FILES.structure, StructureSchema, raw.structure);
  const metadata = parseFile(PROFILE_FILES.metadata, MetadataSchema, raw.metadata);
  const checksum = parseFile(PROFILE_FILES.checksum, ChecksumSchema, raw.checksum);

  // manifest.json is optional: validate it if present, otherwise derive it.
  const manifestPath = path.join(dir, PROFILE_FILES.manifest);
  const manifest = (await fs.pathExists(manifestPath))
    ? parseFile(
        PROFILE_FILES.manifest,
        ManifestSchema,
        await readRawFile(dir, PROFILE_FILES.manifest),
      )
    : buildManifest(tooling, checksum);

  return { profile, tooling, structure, metadata, checksum, manifest };
}
