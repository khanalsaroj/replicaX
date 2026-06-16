import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { REPO_ARCHIVE_LIMITS, safeExtract } from '@/core/archive';
import { ReplicaxError } from '@/utils/errors';

/**
 * Fetch a GitHub repository's *setup* for `replicax extract`. We download the
 * repo as a tarball over the GitHub API (no `git` binary required) into a temp
 * directory; the caller then scans it with the normal capture pipeline and is
 * responsible for calling {@link DownloadedRepo.cleanup}.
 *
 * Only public repos work out of the box. A `GITHUB_TOKEN` / `GH_TOKEN` in the
 * environment is forwarded so private repos and higher rate limits work too —
 * it is read from the environment and never stored.
 */
export interface GitHubRef {
  owner: string;
  repo: string;
  /** Branch, tag, or commit. Omitted means the repo's default branch. */
  ref?: string;
}

export interface DownloadedRepo {
  /** Absolute path to the extracted repository root. */
  dir: string;
  /** Remove the temp directory tree. Safe to call more than once. */
  cleanup: () => Promise<void>;
}

/**
 * Parse a user-supplied repository reference into owner/repo/ref. Accepts:
 *   owner/repo · owner/repo#branch · owner/repo@tag
 *   https://github.com/owner/repo[.git] · github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch · git@github.com:owner/repo.git
 */
export function parseGitHubRef(input: string): GitHubRef {
  const raw = input.trim();
  if (!raw) {
    throw new ReplicaxError('No repository specified.', [
      'Pass a repo, e.g. replicax extract owner/repo',
    ]);
  }

  // Split off an explicit "#ref" fragment first (owner/repo#branch).
  let work = raw;
  let ref: string | undefined;
  const hash = work.indexOf('#');
  if (hash !== -1) {
    ref = work.slice(hash + 1).trim() || undefined;
    work = work.slice(0, hash);
  }

  // Strip any github.com host/protocol prefix (https, bare host, or ssh).
  work = work
    .replace(/^git@github\.com:/i, '')
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '')
    .replace(/^\/+/, '');

  const segments = work.split('/').filter(Boolean);
  const owner = segments[0];
  const repoSegment = segments[1];
  if (!owner || !repoSegment) {
    throw new ReplicaxError(`Could not parse a GitHub repository from "${input}".`, [
      'Use owner/repo, a full https://github.com/owner/repo URL, or add #branch.',
    ]);
  }

  let repo = repoSegment.replace(/\.git$/i, '');

  // owner/repo@ref shorthand.
  if (!ref && repo.includes('@')) {
    const [name, atRef] = repo.split('@');
    repo = name ?? repo;
    if (atRef) ref = atRef;
  }

  // Web-UI URLs encode the ref as /tree/<ref>, /commit/<ref>, or /blob/<ref>.
  const kind = segments[2];
  if (!ref && (kind === 'tree' || kind === 'commit' || kind === 'blob')) {
    const rest = segments.slice(3).join('/'); // branch names may contain "/"
    if (rest) ref = rest;
  }

  const valid = (s: string) => /^[\w.-]+$/.test(s) && s !== '.' && s !== '..';
  if (!valid(owner) || !valid(repo)) {
    throw new ReplicaxError(`Invalid GitHub repository: "${owner}/${repo}".`, [
      'Owner and repo may contain only letters, numbers, ".", "_", and "-".',
    ]);
  }

  return { owner, repo, ...(ref ? { ref } : {}) };
}

/** A short "owner/repo" (with optional "@ref") label for messages. */
export function refLabel(ref: GitHubRef): string {
  return `${ref.owner}/${ref.repo}${ref.ref ? `@${ref.ref}` : ''}`;
}

function tokenFromEnv(): string | undefined {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return token?.trim() || undefined;
}

function httpError(status: number, slug: string, hasToken: boolean): ReplicaxError {
  if (status === 404) {
    return new ReplicaxError(`Repository not found: ${slug}.`, [
      'Check the owner/repo spelling and the branch/tag/commit name.',
      hasToken
        ? 'If it is private, make sure your token can access it.'
        : 'If it is private, set GITHUB_TOKEN (or GH_TOKEN) with repo access.',
    ]);
  }
  if (status === 401) {
    return new ReplicaxError(`GitHub rejected the credentials for ${slug}.`, [
      'Check that GITHUB_TOKEN (or GH_TOKEN) is valid and not expired.',
    ]);
  }
  if (status === 403 || status === 429) {
    return new ReplicaxError(`GitHub rate limit hit while fetching ${slug}.`, [
      hasToken
        ? 'Wait a moment and try again.'
        : 'Set GITHUB_TOKEN (or GH_TOKEN) to raise the limit, then retry.',
    ]);
  }
  return new ReplicaxError(`GitHub returned HTTP ${status} for ${slug}.`);
}

/** First subdirectory of `dir`, or null. GitHub tarballs hold exactly one. */
async function firstSubdir(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) return path.join(dir, entry.name);
  }
  return null;
}

/**
 * Download a GitHub repo tarball into a fresh temp directory and extract it.
 * Returns the extracted repository root plus a cleanup callback. On any failure
 * the temp directory is removed before the error propagates.
 */
export async function downloadRepo(ref: GitHubRef): Promise<DownloadedRepo> {
  const slug = `${ref.owner}/${ref.repo}`;
  const url =
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/tarball` +
    (ref.ref ? `/${encodeURIComponent(ref.ref)}` : '');

  const token = tokenFromEnv();
  const headers: Record<string, string> = {
    'user-agent': 'replicax',
    accept: 'application/vnd.github+json',
  };
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, { headers, redirect: 'follow' });
  } catch (err) {
    throw new ReplicaxError(`Failed to reach GitHub: ${(err as Error).message}`, [
      'Check your internet connection and try again.',
    ]);
  }
  if (!res.ok) {
    throw httpError(res.status, slug, Boolean(token));
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'replicax-extract-'));
  const cleanup = () => fs.remove(tmpRoot);
  try {
    const tarPath = path.join(tmpRoot, 'repo.tar.gz');
    await fs.writeFile(tarPath, Buffer.from(await res.arrayBuffer()));

    const extractDir = path.join(tmpRoot, 'src');
    await fs.ensureDir(extractDir);
    // GitHub tarballs are scoped under one top-level <owner>-<repo>-<sha>/ dir.
    // safeExtract enforces size/entry caps and rejects path traversal before
    // writing anything (links in a repo tarball are skipped, not followed).
    await safeExtract(tarPath, extractDir, REPO_ARCHIVE_LIMITS);

    const repoRoot = await firstSubdir(extractDir);
    if (!repoRoot) {
      throw new ReplicaxError(`The downloaded archive for ${slug} was empty.`);
    }
    return { dir: repoRoot, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
