import path from 'node:path';
import fs from 'fs-extra';
import { z } from 'zod';
import { PROFILE_FILES, REPLICAX_DIR } from '@/constants';
import {
  ChecksumSchema,
  MetadataSchema,
  ProfileSchema,
  StructureSchema,
  ToolingSchema,
  type ProfileBundle,
} from '@/schema';
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
  await Promise.all([
    fs.writeJson(path.join(dir, PROFILE_FILES.profile), bundle.profile, { spaces: 2 }),
    fs.writeJson(path.join(dir, PROFILE_FILES.tooling), bundle.tooling, { spaces: 2 }),
    fs.writeJson(path.join(dir, PROFILE_FILES.structure), bundle.structure, { spaces: 2 }),
    fs.writeJson(path.join(dir, PROFILE_FILES.metadata), bundle.metadata, { spaces: 2 }),
    fs.writeJson(path.join(dir, PROFILE_FILES.checksum), bundle.checksum, { spaces: 2 }),
  ]);
}

async function readAndParse<T>(dir: string, file: string, schema: z.ZodType<T>): Promise<T> {
  const full = path.join(dir, file);
  if (!(await fs.pathExists(full))) {
    throw new ReplicaxError(`Profile is missing ${file}`, [`Expected at ${full}.`]);
  }
  let raw: unknown;
  try {
    raw = await fs.readJson(full);
  } catch {
    throw new ReplicaxError(`Profile file ${file} is not valid JSON`, [`Path: ${full}`]);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ReplicaxError(`Profile file ${file} failed validation`, issues);
  }
  return result.data;
}

/** Load and validate a complete profile bundle from `dir`. */
export async function loadBundle(dir: string): Promise<ProfileBundle> {
  if (!(await profileExists(dir))) {
    throw new ReplicaxError(`No ReplicaX profile found in ${dir}`, [
      'Run `replicax init` to create one.',
    ]);
  }
  const [profile, tooling, structure, metadata, checksum] = await Promise.all([
    readAndParse(dir, PROFILE_FILES.profile, ProfileSchema),
    readAndParse(dir, PROFILE_FILES.tooling, ToolingSchema),
    readAndParse(dir, PROFILE_FILES.structure, StructureSchema),
    readAndParse(dir, PROFILE_FILES.metadata, MetadataSchema),
    readAndParse(dir, PROFILE_FILES.checksum, ChecksumSchema),
  ]);
  return { profile, tooling, structure, metadata, checksum };
}
