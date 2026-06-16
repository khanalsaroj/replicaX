import { Confidence, defineDetector, hit, type DetectionContext, type Detector } from '../types';

/** The package-manager name declared in `package.json#packageManager`, if any. */
function pmField(ctx: DetectionContext): string | null {
  const field = ctx.pkg?.packageManager;
  if (typeof field !== 'string') return null;
  return field.split('@')[0]?.trim().toLowerCase() ?? null;
}

export const packageManagerDetectors: Detector[] = [
  defineDetector({ id: 'npm', name: 'npm', category: 'package-manager' }, (ctx) => {
    if (ctx.has('package-lock.json')) return hit(Confidence.Confirmed, 'package-lock.json');
    if (ctx.has('npm-shrinkwrap.json')) return hit(Confidence.Confirmed, 'npm-shrinkwrap.json');
    if (pmField(ctx) === 'npm') return hit(Confidence.Strong, 'package.json#packageManager');
    return null;
  }),
  defineDetector({ id: 'pnpm', name: 'pnpm', category: 'package-manager' }, (ctx) => {
    if (ctx.has('pnpm-lock.yaml')) return hit(Confidence.Confirmed, 'pnpm-lock.yaml');
    if (ctx.has('pnpm-workspace.yaml')) return hit(Confidence.Strong, 'pnpm-workspace.yaml');
    if (pmField(ctx) === 'pnpm') return hit(Confidence.Strong, 'package.json#packageManager');
    return null;
  }),
  defineDetector({ id: 'yarn', name: 'Yarn', category: 'package-manager' }, (ctx) => {
    if (ctx.has('yarn.lock')) return hit(Confidence.Confirmed, 'yarn.lock');
    if (pmField(ctx) === 'yarn') return hit(Confidence.Strong, 'package.json#packageManager');
    return null;
  }),
  defineDetector({ id: 'bun', name: 'Bun', category: 'package-manager' }, (ctx) => {
    if (ctx.has('bun.lockb')) return hit(Confidence.Confirmed, 'bun.lockb');
    if (ctx.has('bun.lock')) return hit(Confidence.Confirmed, 'bun.lock');
    if (pmField(ctx) === 'bun') return hit(Confidence.Strong, 'package.json#packageManager');
    return null;
  }),
];
