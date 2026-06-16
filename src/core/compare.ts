import type { Detection, Metadata, ProfileBundle } from '@/schema';
import { PACKAGE_JSON_KEY } from '@/core/checksum';
import { diffStringMaps } from '@/core/diff';

/**
 * The `compare` engine. A {@link Comparator} turns two profile bundles into one
 * {@link CompareSection} (added / removed / changed). The registry is extensible:
 * a new dimension to compare is one more entry, mirroring the detector and
 * config-catalogue patterns elsewhere in the codebase.
 */
export interface CompareSection {
  id: string;
  title: string;
  added: string[];
  removed: string[];
  changed: string[];
}

export interface Comparison {
  sections: CompareSection[];
}

interface Comparator {
  id: string;
  title: string;
  compare(a: ProfileBundle, b: ProfileBundle): CompareSection;
}

function detectionsOf(bundle: ProfileBundle): Detection[] {
  return bundle.metadata.detections ?? [];
}

/** Tooling/stack diff, by detected tool (id), reporting display names. */
const toolingComparator: Comparator = {
  id: 'tooling',
  title: 'Tooling',
  compare(a, b) {
    const aById = new Map(detectionsOf(a).map((d) => [d.id, d]));
    const bById = new Map(detectionsOf(b).map((d) => [d.id, d]));
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    for (const [id, d] of bById) if (!aById.has(id)) added.push(d.name);
    for (const [id, d] of aById) if (!bById.has(id)) removed.push(d.name);
    for (const [id, d] of aById) {
      const other = bById.get(id);
      if (other && other.confidence !== d.confidence) changed.push(d.name);
    }
    return sortSection({ id: this.id, title: this.title, added, removed, changed });
  },
};

const PACKAGE_JSON_KEYS = new Set([PACKAGE_JSON_KEY]);

/** Captured config-file diff, by content hash (excludes the package.json template). */
const configFilesComparator: Comparator = {
  id: 'config-files',
  title: 'Configuration files',
  compare(a, b) {
    const diff = diffStringMaps(a.checksum.files, b.checksum.files, {
      ignoreKeys: PACKAGE_JSON_KEYS,
    });
    return { id: this.id, title: this.title, ...diff };
  },
};

/** package.json template diff: scripts + devDependencies, namespaced. */
const packageJsonComparator: Comparator = {
  id: 'package-json',
  title: 'package.json',
  compare(a, b) {
    const flatten = (bundle: ProfileBundle): Record<string, string> => {
      const pkg = bundle.tooling.packageJson;
      const out: Record<string, string> = {};
      for (const [name, cmd] of Object.entries(pkg?.scripts ?? {})) out[`script:${name}`] = cmd;
      for (const [name, ver] of Object.entries(pkg?.devDependencies ?? {})) {
        out[`devDependency:${name}`] = ver;
      }
      return out;
    };
    const diff = diffStringMaps(flatten(a), flatten(b));
    return { id: this.id, title: this.title, ...diff };
  },
};

/** Directory-structure diff (added / removed; directories never "change"). */
const structureComparator: Comparator = {
  id: 'structure',
  title: 'Structure',
  compare(a, b) {
    const before = new Set(a.structure.directories);
    const after = new Set(b.structure.directories);
    const added = b.structure.directories.filter((d) => !before.has(d));
    const removed = a.structure.directories.filter((d) => !after.has(d));
    return sortSection({ id: this.id, title: this.title, added, removed, changed: [] });
  },
};

/** Inferred-metadata diff, rendered as "field: from → to" change lines. */
const metadataComparator: Comparator = {
  id: 'metadata',
  title: 'Metadata',
  compare(a, b) {
    const fields: Array<keyof Metadata> = [
      'language',
      'framework',
      'packageManager',
      'nodeVersion',
    ];
    const changed: string[] = [];
    for (const field of fields) {
      const from = String(a.metadata[field] ?? '');
      const to = String(b.metadata[field] ?? '');
      if (from !== to) changed.push(`${field}: ${from} → ${to}`);
    }
    return { id: this.id, title: this.title, added: [], removed: [], changed };
  },
};

const COMPARATORS: Comparator[] = [
  toolingComparator,
  configFilesComparator,
  packageJsonComparator,
  structureComparator,
  metadataComparator,
];

function sortSection(section: CompareSection): CompareSection {
  return {
    ...section,
    added: [...section.added].sort(),
    removed: [...section.removed].sort(),
    changed: [...section.changed].sort(),
  };
}

/** Compare two profile bundles across every registered dimension. */
export function compareBundles(a: ProfileBundle, b: ProfileBundle): Comparison {
  return { sections: COMPARATORS.map((c) => c.compare(a, b)) };
}

/** Whether a section carries any difference. */
export function sectionHasChanges(section: CompareSection): boolean {
  return section.added.length > 0 || section.removed.length > 0 || section.changed.length > 0;
}

/** Whether any section in a comparison carries a difference. */
export function comparisonHasChanges(comparison: Comparison): boolean {
  return comparison.sections.some(sectionHasChanges);
}
