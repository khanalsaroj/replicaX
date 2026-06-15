import { z } from 'zod';

/**
 * Zod schemas for the five files that make up a ReplicaX profile. These are the
 * single source of truth: TypeScript types are inferred from them, and the
 * `validate` command re-parses on-disk JSON through them to catch corruption.
 */

/** profile.json — top-level identity and metadata. */
export const ProfileSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().optional(),
  replicaxVersion: z.string().min(1),
  description: z.string().optional(),
});

export const FileVariantSchema = z.enum(['ts', 'js', 'mjs', 'cjs', 'json', 'yaml', 'other']);

/** A single captured configuration file, stored verbatim. */
export const ToolingFileSchema = z.object({
  /** POSIX-style path relative to the project root. */
  path: z.string().min(1),
  /** High-level grouping, e.g. "typescript", "eslint", "docker". */
  category: z.string().min(1),
  /** Detected file flavour, used purely for display/inspection. */
  variant: FileVariantSchema,
  /** Text encoding of {@link content}. */
  encoding: z.enum(['utf8', 'base64']),
  /** Verbatim file contents. */
  content: z.string(),
  /** Original size in bytes. */
  bytes: z.number().int().nonnegative(),
});

/**
 * Curated `package.json` template. We intentionally keep only setup-relevant
 * fields — never runtime `dependencies`, which are application code.
 */
export const PackageTemplateSchema = z.object({
  type: z.string().optional(),
  scripts: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  engines: z.record(z.string(), z.string()).optional(),
  packageManager: z.string().optional(),
  /** Pass-through config blocks that legitimately live in package.json. */
  config: z.record(z.string(), z.unknown()).optional(),
});

/** tooling.json — every captured config file plus the package.json template. */
export const ToolingSchema = z.object({
  files: z.array(ToolingFileSchema),
  packageJson: PackageTemplateSchema.optional(),
});

/** structure.json — folder hierarchy only (sorted POSIX relative dir paths). */
export const StructureSchema = z.object({
  root: z.string(),
  directories: z.array(z.string()),
});

/** metadata.json — project context inferred during the scan. */
export const MetadataSchema = z.object({
  nodeVersion: z.string(),
  packageManager: z.enum(['npm', 'yarn', 'pnpm', 'bun', 'unknown']),
  framework: z.string(),
  language: z.enum(['typescript', 'javascript']),
  platform: z.string(),
});

/** checksum.json — SHA-256 integrity hashes keyed by logical file name. */
export const ChecksumSchema = z.object({
  algorithm: z.literal('sha256'),
  files: z.record(z.string(), z.string()),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type FileVariant = z.infer<typeof FileVariantSchema>;
export type ToolingFile = z.infer<typeof ToolingFileSchema>;
export type PackageTemplate = z.infer<typeof PackageTemplateSchema>;
export type Tooling = z.infer<typeof ToolingSchema>;
export type Structure = z.infer<typeof StructureSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type Checksum = z.infer<typeof ChecksumSchema>;

/** The full in-memory profile, mirroring the five on-disk files. */
export interface ProfileBundle {
  profile: Profile;
  tooling: Tooling;
  structure: Structure;
  metadata: Metadata;
  checksum: Checksum;
}

export type PackageManager = Metadata['packageManager'];
