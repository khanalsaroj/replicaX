import type { Detection, DetectionCategory, Metadata } from '@/schema';
import type { RawPackageJson } from '@/core/detect';
import type { DetectionContext, Detector } from './types';
import { gatherContext } from './context';
import { metadataDetections } from './detectors/languages';
import { packageManagerDetectors } from './detectors/packageManagers';
import { toolingDetectors } from './detectors/tooling';
import { editorDetectors } from './detectors/editors';
import { jvmDetectors } from './detectors/jvm';

/**
 * The detector registry. Adding a detector is a single array entry in one of the
 * grouped files — mirroring how `config/supported-files.ts` catalogues capture
 * globs. Order here doesn't matter; {@link sortDetections} imposes report order.
 */
export const DETECTORS: Detector[] = [
  ...packageManagerDetectors,
  ...toolingDetectors,
  ...editorDetectors,
  ...jvmDetectors,
];

/** Display/report ordering: stack identity first, tooling next, editors last. */
const CATEGORY_ORDER: DetectionCategory[] = [
  'language',
  'framework',
  'jvm',
  'package-manager',
  'monorepo',
  'build',
  'lint',
  'format',
  'test',
  'container',
  'ci',
  'git-hooks',
  'commit',
  'devcontainer',
  'editor',
  'ai',
];

/** Stable, human-friendly ordering: by category bucket, then name. */
export function sortDetections(list: Detection[]): Detection[] {
  return [...list].sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });
}

/** Run every detector against a context, dropping the non-matches. */
export function runDetectors(ctx: DetectionContext): Detection[] {
  return DETECTORS.map((d) => d.detect(ctx)).filter((d): d is Detection => d !== null);
}

/**
 * Detect the full stack for a project: gather the evidence context, run the
 * filesystem detectors, merge in the language/framework detections derived from
 * inferred `metadata`, de-duplicate by id (metadata wins), and sort for display.
 */
export async function detectStack(
  root: string,
  pkg: RawPackageJson | null,
  metadata?: Metadata,
): Promise<Detection[]> {
  const ctx = await gatherContext(root, pkg);
  const fromDetectors = runDetectors(ctx);
  const fromMetadata = metadata ? metadataDetections(metadata) : [];

  const byId = new Map<string, Detection>();
  for (const d of [...fromMetadata, ...fromDetectors]) {
    if (!byId.has(d.id)) byId.set(d.id, d);
  }
  return sortDetections([...byId.values()]);
}
