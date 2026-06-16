import { REPLICAX_VERSION } from '@/constants';
import type { Metadata, Profile, ProfileBundle, ProfileSource, Structure, Tooling } from '@/schema';
import { computeChecksum } from '@/core/checksum';
import { buildManifest } from '@/core/manifest';

export interface BuildBundleArgs {
  name: string;
  description?: string;
  tooling: Tooling;
  structure: Structure;
  metadata: Metadata;
  /** Provenance of this capture (init/sync → local, extract → github). */
  source?: ProfileSource;
  /** When syncing, the previous profile whose identity we preserve. */
  existing?: Profile;
}

/**
 * Assemble the five-part profile bundle from scan results. On a fresh `init`
 * we mint identity; on `sync` we carry forward createdAt/version and bump
 * updatedAt.
 */
export function buildBundle(args: BuildBundleArgs): ProfileBundle {
  const now = new Date().toISOString();

  const profile: Profile = args.existing
    ? {
        ...args.existing,
        name: args.name,
        description: args.description ?? args.existing.description,
        replicaxVersion: REPLICAX_VERSION,
        updatedAt: now,
        // Preserve the original provenance on sync unless explicitly overridden.
        ...((args.source ?? args.existing.source)
          ? { source: args.source ?? args.existing.source }
          : {}),
      }
    : {
        name: args.name,
        version: '1.0.0',
        createdAt: now,
        replicaxVersion: REPLICAX_VERSION,
        ...(args.description ? { description: args.description } : {}),
        ...(args.source ? { source: args.source } : {}),
      };

  const checksum = computeChecksum(args.tooling);

  return {
    profile,
    tooling: args.tooling,
    structure: args.structure,
    metadata: args.metadata,
    checksum,
    manifest: buildManifest(args.tooling, checksum),
  };
}
