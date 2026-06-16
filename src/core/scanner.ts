import path from 'node:path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import { CONFIG_CATEGORIES } from '@/config/supported-files';
import { INCLUDE_FILE, INCLUDE_PRUNE_GLOBS, SCAN_PRUNE_GLOBS } from '@/constants';
import type { Detection, Metadata, Structure, Tooling, ToolingFile } from '@/schema';
import { detectVariant, toPosix } from '@/utils/paths';
import { logger } from '@/utils/logger';
import { IgnoreEngine } from '@/core/ignore-engine';
import { detectMetadata, readPackageJson, type RawPackageJson } from '@/core/detect';
import { buildPackageTemplate } from '@/core/package-template';
import { detectStack } from '@/core/detection/registry';

export interface ScanResult {
  tooling: Tooling;
  structure: Structure;
  metadata: Metadata;
  pkg: RawPackageJson | null;
  /** Detected tools/technologies with confidence (also stored in metadata). */
  detections: Detection[];
  /** Paths skipped by the secret guard — surfaced so the user knows. */
  skippedSecrets: string[];
}

const FG_BASE_OPTIONS = {
  dot: true,
  followSymbolicLinks: false,
  suppressErrors: true,
  ignore: SCAN_PRUNE_GLOBS,
} as const;

/**
 * Strip credential-bearing lines out of an `.npmrc` before it enters a profile.
 * `.npmrc` is a legitimate setup file, but it can also hold auth tokens.
 */
export function sanitizeNpmrc(content: string): string {
  const lines = content.split(/\r?\n/);
  const sensitive = /(_auth(token)?|_password|:_secret|:always-auth=)/i;
  const assignment = /^\s*[^#;=\s]*(token|password|secret|api[-_]?key)\s*=/i;
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return true;
    return !sensitive.test(trimmed) && !assignment.test(trimmed);
  });
  return kept.join('\n');
}

/**
 * Read the user's `.replicaxinclude` glob patterns (one per line, `#` comments).
 * A trailing `/` is expanded to `/**` so "include this directory" works as
 * expected. Patterns are fast-glob globs evaluated from the project root.
 */
async function readIncludePatterns(root: string): Promise<string[]> {
  const file = path.join(root, INCLUDE_FILE);
  if (!(await fs.pathExists(file))) return [];
  const content = await fs.readFile(file, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => (line.endsWith('/') ? `${line}**` : line));
}

interface Candidate {
  rel: string;
  /** `catalogue` files honour all ignores; `include` files only the user's. */
  source: 'catalogue' | 'include';
  category: string;
}

/** Discover, filter and read every supported configuration file. */
async function scanToolingFiles(
  root: string,
  ignore: IgnoreEngine,
): Promise<{ files: ToolingFile[]; skippedSecrets: string[] }> {
  // 1. The built-in catalogue.
  const categoryOf = new Map<string, string>();
  for (const category of CONFIG_CATEGORIES) {
    const found = await fg(category.patterns, {
      cwd: root,
      onlyFiles: true,
      unique: true,
      ...FG_BASE_OPTIONS,
    });
    for (const rel of found) {
      const norm = toPosix(rel);
      if (!categoryOf.has(norm)) categoryOf.set(norm, category.id);
    }
  }

  // 2. Additive `.replicaxinclude` files the catalogue didn't already pick up.
  //    Globbed with a lighter prune so an explicit include can reach locations
  //    the normal scan skips (e.g. `.vscode/`).
  const includePatterns = await readIncludePatterns(root);
  const included = new Set<string>();
  if (includePatterns.length > 0) {
    const found = await fg(includePatterns, {
      cwd: root,
      onlyFiles: true,
      unique: true,
      dot: true,
      followSymbolicLinks: false,
      suppressErrors: true,
      ignore: INCLUDE_PRUNE_GLOBS,
    });
    for (const rel of found) {
      const norm = toPosix(rel);
      if (!categoryOf.has(norm)) included.add(norm);
    }
  }

  const candidates: Candidate[] = [
    ...[...categoryOf.entries()].map(
      ([rel, category]): Candidate => ({ rel, source: 'catalogue', category }),
    ),
    ...[...included].map((rel): Candidate => ({ rel, source: 'include', category: 'included' })),
  ].sort((a, b) => a.rel.localeCompare(b.rel));

  const files: ToolingFile[] = [];
  const skippedSecrets: string[] = [];

  for (const { rel, source, category } of candidates) {
    if (rel === 'package.json') continue; // curated separately

    // The secret guard is absolute — even an explicit include cannot leak one.
    if (ignore.isSecret(rel)) {
      skippedSecrets.push(rel);
      logger.detail(`skipped (secret guard): ${rel}`);
      continue;
    }
    // `.replicaxignore` always wins. Catalogue files also honour the built-in
    // defaults; an explicit include overrides those (user excludes still apply).
    const excluded = source === 'include' ? ignore.isUserIgnored(rel) : ignore.isIgnored(rel);
    if (excluded) {
      logger.detail(`skipped (.replicaxignore): ${rel}`);
      continue;
    }

    const abs = path.join(root, rel);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    let content = await fs.readFile(abs, 'utf8');
    if (path.basename(rel) === '.npmrc') content = sanitizeNpmrc(content);

    files.push({
      path: rel,
      category,
      variant: detectVariant(rel),
      encoding: 'utf8',
      content,
      bytes: Buffer.byteLength(content, 'utf8'),
    });
    logger.detail(`captured${source === 'include' ? ' (include)' : ''}: ${rel}`);
  }

  return { files, skippedSecrets };
}

/** Capture the folder hierarchy (directories only — never source files). */
async function scanStructure(root: string, ignore: IgnoreEngine): Promise<Structure> {
  const dirs = await fg('**', {
    cwd: root,
    onlyDirectories: true,
    unique: true,
    ...FG_BASE_OPTIONS,
  });

  const directories = dirs
    .map(toPosix)
    .filter((d) => d.length > 0 && d !== '.')
    .filter((d) => !ignore.isIgnored(d))
    .sort();

  return {
    root: path.basename(path.resolve(root)) || 'project',
    directories,
  };
}

/** Run a full scan of `root`, producing everything needed to build a profile. */
export async function scanProject(root: string): Promise<ScanResult> {
  const resolved = path.resolve(root);
  if (!(await fs.pathExists(resolved))) {
    throw new Error(`Directory does not exist: ${resolved}`);
  }

  const ignore = await IgnoreEngine.fromProject(resolved);
  const pkg = await readPackageJson(resolved);

  const [{ files, skippedSecrets }, structure, metadata] = await Promise.all([
    scanToolingFiles(resolved, ignore),
    scanStructure(resolved, ignore),
    detectMetadata(resolved, pkg),
  ]);

  // Detection depends on the inferred metadata (for language/framework), so it
  // runs after the parallel batch; it does its own bounded filesystem probe.
  const detections = await detectStack(resolved, pkg, metadata);
  metadata.detections = detections;

  const tooling: Tooling = {
    files,
    packageJson: buildPackageTemplate(pkg),
  };

  return { tooling, structure, metadata, pkg, detections, skippedSecrets };
}
