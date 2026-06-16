/**
 * Catalogue of developer tools `replicax doctor` probes for. Like
 * `config/supported-files.ts`, this is the single list the command consults —
 * adding a tool is one entry, no other code changes.
 */
export type EnvToolKind = 'runtime' | 'vcs' | 'package-manager' | 'container' | 'editor';

export interface EnvTool {
  /** Stable id, used in `--json` output. */
  id: string;
  /** Human-friendly label. */
  name: string;
  /** Executable name resolved on PATH. */
  bin: string;
  /** Args that print a version, e.g. `['--version']`. */
  versionArgs: string[];
  kind: EnvToolKind;
  /** Optional custom version extractor; defaults to a generic semver match. */
  parseVersion?: (raw: string) => string | undefined;
}

export const ENVIRONMENT_TOOLS: EnvTool[] = [
  { id: 'node', name: 'Node.js', bin: 'node', versionArgs: ['--version'], kind: 'runtime' },
  { id: 'git', name: 'Git', bin: 'git', versionArgs: ['--version'], kind: 'vcs' },
  { id: 'npm', name: 'npm', bin: 'npm', versionArgs: ['--version'], kind: 'package-manager' },
  { id: 'pnpm', name: 'pnpm', bin: 'pnpm', versionArgs: ['--version'], kind: 'package-manager' },
  { id: 'yarn', name: 'Yarn', bin: 'yarn', versionArgs: ['--version'], kind: 'package-manager' },
  { id: 'bun', name: 'Bun', bin: 'bun', versionArgs: ['--version'], kind: 'package-manager' },
  { id: 'docker', name: 'Docker', bin: 'docker', versionArgs: ['--version'], kind: 'container' },
  {
    id: 'vscode',
    name: 'VS Code',
    bin: 'code',
    versionArgs: ['--version'],
    kind: 'editor',
    // `code --version` prints version on the first line, then commit + arch.
    parseVersion: (raw) => raw.split(/\r?\n/)[0]?.trim() || undefined,
  },
  { id: 'cursor', name: 'Cursor', bin: 'cursor', versionArgs: ['--version'], kind: 'editor' },
  {
    id: 'claude-code',
    name: 'Claude Code',
    bin: 'claude',
    versionArgs: ['--version'],
    kind: 'editor',
  },
  { id: 'windsurf', name: 'Windsurf', bin: 'windsurf', versionArgs: ['--version'], kind: 'editor' },
];
