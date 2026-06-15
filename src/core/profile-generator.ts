import { REPLICAX_VERSION } from '@/constants';
import type { Metadata, Profile, ProfileBundle, Structure, Tooling } from '@/schema';
import { computeChecksum } from '@/core/checksum';

export interface BuildBundleArgs {
  name: string;
  description?: string;
  tooling: Tooling;
  structure: Structure;
  metadata: Metadata;
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
      }
    : {
        name: args.name,
        version: '1.0.0',
        createdAt: now,
        replicaxVersion: REPLICAX_VERSION,
        ...(args.description ? { description: args.description } : {}),
      };

  return {
    profile,
    tooling: args.tooling,
    structure: args.structure,
    metadata: args.metadata,
    checksum: computeChecksum(args.tooling),
  };
}
