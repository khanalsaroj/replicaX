import path from 'node:path';
import fs from 'fs-extra';
import ignore from 'ignore';
import { DEFAULT_IGNORE_PATTERNS, IGNORE_FILE, SECRET_GUARD_GLOBS } from '@/constants';

type Ig = ReturnType<typeof ignore>;

/**
 * Decides what is excluded from a profile. Two layers:
 *
 *  1. **ignore** — default patterns plus the user's `.replicaxignore`. These are
 *     advisory excludes (build output, dependencies, business logic, …).
 *  2. **secret guard** — a fixed set of patterns that can never be overridden,
 *     enforcing the PRD's hard rule that secrets are never exported.
 *
 * Both use gitignore semantics via the `ignore` package and expect POSIX paths.
 */
export class IgnoreEngine {
  private readonly ig: Ig;
  private readonly userIg: Ig;
  private readonly secrets: Ig;
  readonly userPatterns: string[];

  constructor(userPatterns: string[] = []) {
    this.userPatterns = userPatterns.filter((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith('#');
    });
    this.ig = ignore().add(DEFAULT_IGNORE_PATTERNS).add(this.userPatterns);
    // A matcher for the user's `.replicaxignore` patterns *only* (no defaults),
    // so an explicit `.replicaxinclude` can override the defaults while the user's
    // own excludes still win. See {@link isUserIgnored}.
    this.userIg = ignore().add(this.userPatterns);
    this.secrets = ignore().add(SECRET_GUARD_GLOBS);
  }

  /** Build an engine from a project's `.replicaxignore`, if present. */
  static async fromProject(root: string): Promise<IgnoreEngine> {
    const file = path.join(root, IGNORE_FILE);
    if (await fs.pathExists(file)) {
      const content = await fs.readFile(file, 'utf8');
      return new IgnoreEngine(content.split(/\r?\n/));
    }
    return new IgnoreEngine([]);
  }

  /** Whether a path is excluded by default or user ignore rules. */
  isIgnored(relPosixPath: string): boolean {
    if (!relPosixPath || relPosixPath === '.') return false;
    return this.ig.ignores(relPosixPath);
  }

  /**
   * Whether a path is excluded by the user's `.replicaxignore` *only* (ignoring
   * the built-in defaults). Used to apply `.replicaxignore`'s precedence over an
   * explicit `.replicaxinclude` without the defaults vetoing the include.
   */
  isUserIgnored(relPosixPath: string): boolean {
    if (!relPosixPath || relPosixPath === '.') return false;
    return this.userIg.ignores(relPosixPath);
  }

  /** Whether a path is a protected secret that must never be captured. */
  isSecret(relPosixPath: string): boolean {
    if (!relPosixPath || relPosixPath === '.') return false;
    return this.secrets.ignores(relPosixPath);
  }
}
