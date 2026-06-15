import path from 'node:path';
import type { FileVariant } from '@/schema';

/** Convert any platform path into a POSIX-style relative path (forward slashes). */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Make `target` relative to `root`, normalized to POSIX separators. */
export function relPosix(root: string, target: string): string {
  return toPosix(path.relative(root, target));
}

/** Classify a file by extension for display/inspection purposes. */
export function detectVariant(filePath: string): FileVariant {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.cts':
    case '.mts':
      return ext === '.cts' ? 'cjs' : ext === '.mts' ? 'mjs' : 'ts';
    case '.js':
      return 'js';
    case '.mjs':
      return 'mjs';
    case '.cjs':
      return 'cjs';
    case '.json':
      return 'json';
    case '.yml':
    case '.yaml':
      return 'yaml';
    default:
      return 'other';
  }
}

/**
 * Reject path segments that would let a profile escape its target directory
 * during `create`/`import` (path traversal / absolute paths). Returns the
 * cleaned POSIX path or throws-worthy `null` if the path is unsafe.
 */
export function safeJoinable(relPath: string): string | null {
  const normalized = toPosix(relPath).replace(/^\.\//, '');
  if (
    normalized.length === 0 ||
    path.isAbsolute(normalized) ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split('/').some((seg) => seg === '..')
  ) {
    return null;
  }
  return normalized;
}
