import { spawn } from 'node:child_process';
import type { PackageManager } from '@/schema';

const COMMANDS: Record<Exclude<PackageManager, 'unknown'>, string[]> = {
  npm: ['npm', 'install'],
  pnpm: ['pnpm', 'install'],
  yarn: ['yarn'],
  bun: ['bun', 'install'],
};

/**
 * Run the project's package manager to install dependencies. Resolves to true
 * on success, false if the manager is unknown or the process exits non-zero.
 * Never throws — a failed install shouldn't undo a successful scaffold.
 */
export function installDependencies(cwd: string, manager: PackageManager): Promise<boolean> {
  if (manager === 'unknown') return Promise.resolve(false);
  const [command, ...args] = COMMANDS[manager];

  return new Promise((resolve) => {
    const child = spawn(command!, args, {
      cwd,
      stdio: 'inherit',
      // npm/pnpm/yarn are .cmd shims on Windows; a shell resolves them.
      shell: process.platform === 'win32',
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}
