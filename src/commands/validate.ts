import { loadBundle, profileDir, profileExists, resolveProfileDir } from '@/core/profile-store';
import { verifyChecksum } from '@/core/checksum';
import { IgnoreEngine } from '@/core/ignore-engine';
import { ReplicaxError } from '@/utils/errors';
import { logger, pc } from '@/utils/logger';
import { safeJoinable } from '@/utils/paths';

export interface ValidateOptions {
  profile?: string;
}

export async function validateCommand(options: ValidateOptions): Promise<void> {
  const dir = options.profile
    ? await resolveProfileDir(options.profile)
    : profileDir(process.cwd());

  if (!(await profileExists(dir))) {
    throw new ReplicaxError('No ReplicaX profile found.', ['Run `replicax init` first.']);
  }

  // loadBundle runs the zod schemas; a malformed profile throws a ReplicaxError.
  const bundle = await loadBundle(dir);
  logger.success('Schema validation passed (profile, tooling, structure, metadata, checksum).');

  const issues: string[] = [];
  const secretGuard = new IgnoreEngine();

  // 1. Integrity: stored checksums must match recomputed ones.
  const mismatches = verifyChecksum(bundle.tooling, bundle.checksum);
  for (const m of mismatches) {
    issues.push(`checksum ${m.reason}: ${m.path}`);
  }

  // 2. Safety: no captured path may escape a target dir, and no secret may have
  //    slipped into the profile.
  for (const file of bundle.tooling.files) {
    if (safeJoinable(file.path) === null) issues.push(`unsafe file path: ${file.path}`);
    if (secretGuard.isSecret(file.path)) issues.push(`secret leaked into profile: ${file.path}`);
  }
  for (const dirPath of bundle.structure.directories) {
    if (safeJoinable(dirPath) === null) issues.push(`unsafe directory path: ${dirPath}`);
  }

  if (issues.length === 0) {
    logger.success('Integrity checks passed — checksums match and no unsafe paths.');
    logger.newline();
    logger.success(pc.bold(`Profile "${bundle.profile.name}" is valid.`));
    return;
  }

  logger.newline();
  logger.error(`Found ${issues.length} issue(s):`);
  for (const issue of issues) logger.hint(issue);
  throw new ReplicaxError('Profile validation failed.', [
    'Re-run `replicax sync` to regenerate from the current project.',
  ]);
}
