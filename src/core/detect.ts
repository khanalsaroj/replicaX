import path from 'node:path';
import fs from 'fs-extra';
import type { Metadata, PackageManager } from '@/schema';

/** Shape of the bits of package.json we care about during detection. */
export interface RawPackageJson {
  name?: string;
  type?: string;
  packageManager?: string;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

/** Read and parse a project's package.json, or null if absent/unparseable. */
export async function readPackageJson(root: string): Promise<RawPackageJson | null> {
  const file = path.join(root, 'package.json');
  if (!(await fs.pathExists(file))) return null;
  try {
    return (await fs.readJson(file)) as RawPackageJson;
  } catch {
    return null;
  }
}

function allDeps(pkg: RawPackageJson | null): Record<string, string> {
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
}

/** Infer the package manager from the `packageManager` field, then lockfiles. */
export async function detectPackageManager(
  root: string,
  pkg: RawPackageJson | null,
): Promise<PackageManager> {
  const field = pkg?.packageManager;
  if (typeof field === 'string') {
    const name = field.split('@')[0]?.trim().toLowerCase();
    if (name === 'pnpm' || name === 'yarn' || name === 'npm' || name === 'bun') return name;
  }

  const lockfiles: Array<[string, PackageManager]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
    ['npm-shrinkwrap.json', 'npm'],
  ];
  for (const [file, manager] of lockfiles) {
    if (await fs.pathExists(path.join(root, file))) return manager;
  }

  return pkg ? 'npm' : 'unknown';
}

/** Infer the target Node version from .nvmrc / .node-version / engines. */
export async function detectNodeVersion(root: string, pkg: RawPackageJson | null): Promise<string> {
  for (const file of ['.nvmrc', '.node-version']) {
    const full = path.join(root, file);
    if (await fs.pathExists(full)) {
      const value = (await fs.readFile(full, 'utf8')).trim();
      if (value) return value;
    }
  }
  const enginesNode = pkg?.engines?.node;
  if (enginesNode) return enginesNode;
  const major = process.versions.node.split('.')[0];
  return `${major}.x`;
}

/** typescript when a tsconfig exists or `typescript` is a dependency. */
export async function detectLanguage(
  root: string,
  pkg: RawPackageJson | null,
): Promise<Metadata['language']> {
  const deps = allDeps(pkg);
  if ('typescript' in deps) return 'typescript';
  for (const file of ['tsconfig.json', 'tsconfig.base.json', 'jsconfig.json']) {
    if (await fs.pathExists(path.join(root, file))) {
      return file === 'jsconfig.json' ? 'javascript' : 'typescript';
    }
  }
  // A JVM project (no package.json) reports java rather than defaulting to js.
  if (!pkg) {
    for (const file of ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle']) {
      if (await fs.pathExists(path.join(root, file))) return 'java';
    }
  }
  return 'javascript';
}

/** Best-effort framework label from dependencies, in priority order. */
export function detectFramework(pkg: RawPackageJson | null): string {
  const deps = allDeps(pkg);
  const has = (name: string): boolean => name in deps;

  const checks: Array<[boolean, string]> = [
    [has('next'), 'next'],
    [has('nuxt') || has('nuxt3'), 'nuxt'],
    [has('@remix-run/react'), 'remix'],
    [has('astro'), 'astro'],
    [has('@angular/core'), 'angular'],
    [has('@sveltejs/kit'), 'sveltekit'],
    [has('@nestjs/core'), 'nestjs'],
    [has('expo'), 'expo'],
    [has('react-native'), 'react-native'],
    [has('vue'), 'vue'],
    [has('svelte'), 'svelte'],
    [has('solid-js'), 'solid'],
    [has('react'), 'react'],
    [has('fastify'), 'fastify'],
    [has('koa'), 'koa'],
    [has('express'), 'express'],
  ];
  for (const [matched, name] of checks) {
    if (matched) return name;
  }
  return pkg ? 'node' : 'unknown';
}

/** Run all detectors and assemble metadata.json contents. */
export async function detectMetadata(root: string, pkg: RawPackageJson | null): Promise<Metadata> {
  const [packageManager, nodeVersion, language] = await Promise.all([
    detectPackageManager(root, pkg),
    detectNodeVersion(root, pkg),
    detectLanguage(root, pkg),
  ]);
  return {
    nodeVersion,
    packageManager,
    framework: detectFramework(pkg),
    language,
    platform: process.platform,
  };
}
