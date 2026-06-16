import { Confidence, defineDetector, hit, type DetectionContext, type Detector } from '../types';

/** First present path matching `re`, or undefined. */
function match(ctx: DetectionContext, re: RegExp): string | undefined {
  for (const p of ctx.present) if (re.test(p)) return p;
  return undefined;
}

/**
 * Minimal JVM ecosystem detectors. ReplicaX stays Node-centric, but the captured
 * surface (Docker, CI, build files, editor config) is language-agnostic, so we
 * detect Maven / Gradle / Spring from their build files and resources. This keeps
 * the JVM example profiles honest without deep-modeling Java metadata.
 */
/** Patterns are end-anchored so they match a build file at any depth (monorepos). */
const POM = /(^|\/)pom\.xml$/;
const GRADLE = /(^|\/)(build|settings)\.gradle(\.kts)?$/;
const APP_CONFIG = /(^|\/)src\/main\/resources\/application[^/]*\.(ya?ml|properties)$/;

export const jvmDetectors: Detector[] = [
  defineDetector({ id: 'maven', name: 'Maven', category: 'jvm' }, (ctx) => {
    const pom = match(ctx, POM);
    if (pom) return hit(Confidence.Confirmed, pom);
    if (ctx.has('mvnw') || ctx.has('mvnw.cmd')) return hit(Confidence.Strong, 'mvnw');
    return null;
  }),
  defineDetector({ id: 'gradle', name: 'Gradle', category: 'jvm' }, (ctx) => {
    const build = match(ctx, GRADLE);
    if (build) return hit(Confidence.Confirmed, build);
    if (ctx.has('gradlew') || ctx.has('gradlew.bat')) return hit(Confidence.Strong, 'gradlew');
    return null;
  }),
  defineDetector({ id: 'spring-boot', name: 'Spring Boot', category: 'framework' }, (ctx) => {
    const appConfig = match(ctx, APP_CONFIG);
    const hasBuild = Boolean(match(ctx, POM) || match(ctx, GRADLE));
    if (appConfig && hasBuild) return hit(Confidence.Strong, appConfig);
    if (appConfig) return hit(Confidence.Likely, appConfig);
    return null;
  }),
];
