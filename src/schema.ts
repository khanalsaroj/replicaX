import { z } from 'zod';

/**
 * Zod schemas for the five files that make up a ReplicaX profile. These are the
 * single source of truth: TypeScript types are inferred from them, and the
 * `validate` command re-parses on-disk JSON through them to catch corruption.
 */

/**
 * Forward-compatibility hook for a future profile registry. Entirely optional —
 * absent on every locally-created profile today — so adding it never invalidates
 * an existing profile.
 */
export const RegistrySchema = z.object({
  /** Stable identifier within a registry, e.g. "acme/react-enterprise". */
  id: z.string().optional(),
  /** Owning namespace/org. */
  namespace: z.string().optional(),
  /** Intended visibility once published. */
  visibility: z.enum(['public', 'private']).optional(),
  /** Where the profile originated (URL, registry name, …). */
  source: z.string().optional(),
});

/**
 * How a profile was captured. Drives the install-trust boundary on `create`:
 * `local` (made here by init/sync) is trusted; `github` (extract) and `import`
 * (adopted from an archive) are untrusted, so dependency install is opt-in.
 * Optional — absent on profiles written before 2.2.0, which are treated as local.
 */
export const ProfileSourceSchema = z.enum(['local', 'github', 'import']);

/** profile.json — top-level identity and metadata. */
export const ProfileSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().optional(),
  replicaxVersion: z.string().min(1),
  description: z.string().optional(),
  /** Provenance of the captured setup (added in schema 2.2.0). */
  source: ProfileSourceSchema.optional(),
  /** Optional registry metadata (future registry compatibility). */
  registry: RegistrySchema.optional(),
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

/**
 * High-level grouping for a detected technology. Kept broad and string-stable so
 * new detectors can slot into an existing category without a schema change.
 */
export const DetectionCategorySchema = z.enum([
  'language',
  'framework',
  'package-manager',
  'monorepo',
  'container',
  'ci',
  'git-hooks',
  'commit',
  'lint',
  'format',
  'test',
  'build',
  'editor',
  'ai',
  'devcontainer',
  'jvm',
]);

/**
 * A single technology/tool detected in a project, with a confidence score. This
 * is the read-only "what does this project use" signal — distinct from the
 * verbatim files captured in {@link ToolingSchema}.
 */
export const DetectionSchema = z.object({
  /** Stable id, e.g. "docker", "github-actions". */
  id: z.string().min(1),
  /** Human-friendly label, e.g. "Docker". */
  name: z.string().min(1),
  category: DetectionCategorySchema,
  /** 0..1 — how sure we are this tool is in use. */
  confidence: z.number().min(0).max(1),
  /** Paths/fields that justify the detection (e.g. ["Dockerfile"]). */
  evidence: z.array(z.string()).default([]),
});

/** metadata.json — project context inferred during the scan. */
export const MetadataSchema = z.object({
  nodeVersion: z.string(),
  packageManager: z.enum(['npm', 'yarn', 'pnpm', 'bun', 'unknown']),
  framework: z.string(),
  language: z.enum(['typescript', 'javascript', 'java', 'unknown']),
  platform: z.string(),
  /** Detected tools/technologies with confidence (added in schema 2.1.0). */
  detections: z.array(DetectionSchema).optional(),
});

/** checksum.json — SHA-256 integrity hashes keyed by logical file name. */
export const ChecksumSchema = z.object({
  algorithm: z.literal('sha256'),
  files: z.record(z.string(), z.string()),
});

/** A single entry in the file manifest — a lightweight index of one artifact. */
export const ManifestEntrySchema = z.object({
  path: z.string().min(1),
  category: z.string().min(1),
  variant: FileVariantSchema,
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
});

/**
 * manifest.json — an explicit, content-free index of every captured artifact
 * (path, category, size, hash). Derived from {@link ToolingSchema} +
 * {@link ChecksumSchema}; useful for comparison and future registry listings
 * without downloading full file contents. Optional on disk: synthesized on load
 * when absent, so older profiles remain valid.
 */
export const ManifestSchema = z.object({
  schemaVersion: z.string().min(1),
  generatedAt: z.string().min(1),
  entries: z.array(ManifestEntrySchema),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileSource = z.infer<typeof ProfileSourceSchema>;
export type Registry = z.infer<typeof RegistrySchema>;
export type FileVariant = z.infer<typeof FileVariantSchema>;
export type ToolingFile = z.infer<typeof ToolingFileSchema>;
export type PackageTemplate = z.infer<typeof PackageTemplateSchema>;
export type Tooling = z.infer<typeof ToolingSchema>;
export type Structure = z.infer<typeof StructureSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type Checksum = z.infer<typeof ChecksumSchema>;
export type DetectionCategory = z.infer<typeof DetectionCategorySchema>;
export type Detection = z.infer<typeof DetectionSchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

/** The full in-memory profile, mirroring the on-disk files. */
export interface ProfileBundle {
  profile: Profile;
  tooling: Tooling;
  structure: Structure;
  metadata: Metadata;
  checksum: Checksum;
  /** Derived index; synthesized on load if `manifest.json` is absent. */
  manifest?: Manifest;
}

export type PackageManager = Metadata['packageManager'];
