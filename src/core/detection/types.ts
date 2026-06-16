import type { Detection, DetectionCategory } from '@/schema';
import type { RawPackageJson } from '@/core/detect';

/**
 * The modular detection layer. A {@link Detector} is a **pure function of a
 * {@link DetectionContext}** — it never touches the filesystem itself — so each
 * one is trivially unit-testable with a hand-built context (no temp dir, no IO).
 * The context is assembled once by `gatherContext` (`./context.ts`).
 *
 * Detection is deliberately separate from *capture* (`config/supported-files.ts`,
 * which decides what files get copied verbatim). A detector may key off evidence
 * ReplicaX never captures — lockfiles, `.vscode/`, `.cursor/` — purely to report
 * "this project uses X" with a confidence score.
 */

export type { Detection, DetectionCategory };

/** Canonical confidence levels, so detectors score consistently. */
export const Confidence = {
  /** A canonical, unambiguous artifact is present (e.g. a Dockerfile). */
  Confirmed: 1,
  /** Strong signal (e.g. a declared dependency, a pinned field). */
  Strong: 0.9,
  /** Secondary/heuristic evidence (e.g. a related config but not the tool itself). */
  Likely: 0.7,
  /** Weak hint. */
  Possible: 0.5,
} as const;

/** Read-only view of a project assembled once and shared by all detectors. */
export interface DetectionContext {
  root: string;
  pkg: RawPackageJson | null;
  /** Merged `dependencies` + `devDependencies`. */
  deps: Record<string, string>;
  /** POSIX-relative paths (files AND directories) known to exist. */
  present: ReadonlySet<string>;
  /** Exact-path existence check. */
  has(rel: string): boolean;
  /** Whether any present path equals or sits under a directory prefix. */
  hasUnder(prefix: string): boolean;
  /** Whether a package (dependency or devDependency) is declared. */
  hasDep(name: string): boolean;
}

/** What a detector's match returns — the metadata (id/name/category) is fixed. */
export interface DetectionHit {
  confidence: number;
  evidence: string[];
}

export type DetectFn = (ctx: DetectionContext) => DetectionHit | null;

export interface Detector {
  id: string;
  name: string;
  category: DetectionCategory;
  /** Returns a full {@link Detection} when present, else `null`. */
  detect(ctx: DetectionContext): Detection | null;
}

interface DetectorMeta {
  id: string;
  name: string;
  category: DetectionCategory;
}

/**
 * Build a {@link Detector} from its fixed metadata and a match function that
 * returns just `{ confidence, evidence }`. Keeps each detector definition to its
 * essence and avoids repeating id/name/category in the returned record.
 */
export function defineDetector(meta: DetectorMeta, fn: DetectFn): Detector {
  return {
    ...meta,
    detect(ctx) {
      const hit = fn(ctx);
      return hit ? { ...meta, confidence: hit.confidence, evidence: hit.evidence } : null;
    },
  };
}

/** Tiny helper to make a `DetectionHit`. */
export function hit(confidence: number, ...evidence: string[]): DetectionHit {
  return { confidence, evidence };
}
