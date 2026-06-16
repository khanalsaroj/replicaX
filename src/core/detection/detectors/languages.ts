import type { Detection, Metadata } from '@/schema';
import { Confidence } from '../types';

/**
 * Language and framework detections are derived from the metadata the scanner
 * already inferred (`core/detect.ts`) rather than re-deriving the framework list
 * here — keeping a single source of truth. The registry merges these with the
 * filesystem-driven detectors.
 */

const LANGUAGE_NAMES: Record<Metadata['language'], string | null> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  java: 'Java',
  unknown: null,
};

/** Pretty labels for framework ids that aren't already display-ready. */
const FRAMEWORK_LABELS: Record<string, string> = {
  next: 'Next.js',
  nuxt: 'Nuxt',
  remix: 'Remix',
  astro: 'Astro',
  angular: 'Angular',
  sveltekit: 'SvelteKit',
  nestjs: 'NestJS',
  expo: 'Expo',
  'react-native': 'React Native',
  vue: 'Vue',
  svelte: 'Svelte',
  solid: 'SolidJS',
  react: 'React',
  fastify: 'Fastify',
  koa: 'Koa',
  express: 'Express',
};

/** Frameworks that aren't worth a detection chip (fallbacks / "no framework"). */
const FRAMEWORK_SKIP = new Set(['unknown', 'node']);

/** Build language + framework detections from inferred project metadata. */
export function metadataDetections(metadata: Metadata): Detection[] {
  const out: Detection[] = [];

  const languageName = LANGUAGE_NAMES[metadata.language];
  if (languageName) {
    out.push({
      id: metadata.language,
      name: languageName,
      category: 'language',
      confidence: Confidence.Confirmed,
      evidence: ['metadata.language'],
    });
  }

  if (metadata.framework && !FRAMEWORK_SKIP.has(metadata.framework)) {
    out.push({
      id: metadata.framework,
      name: FRAMEWORK_LABELS[metadata.framework] ?? metadata.framework,
      category: 'framework',
      confidence: Confidence.Confirmed,
      evidence: ['package.json'],
    });
  }

  return out;
}
