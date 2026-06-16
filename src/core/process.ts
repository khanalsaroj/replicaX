import { spawn } from 'node:child_process';

/**
 * Small, dependency-free helpers for probing the local environment: checking
 * whether an executable is on PATH and reading a command's output (e.g. a
 * `--version` string). Both are cross-platform and never run a shell with
 * untrusted input.
 *
 * This is the shared home for process utilities used by both the AI CLI layer
 * (`core/ai/cli.ts`) and `replicax doctor` (`core/environment.ts`).
 */

/** Whether an executable is resolvable on PATH (cross-platform). */
export async function commandExists(bin: string): Promise<boolean> {
  const onWindows = process.platform === 'win32';
  const locator = onWindows ? 'where' : 'command';
  const args = onWindows ? [bin] : ['-v', bin];
  return new Promise((resolve) => {
    const child = spawn(locator, args, {
      // `command -v` is a POSIX shell builtin; `where` is a real Windows exe.
      shell: !onWindows,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

export interface CommandOutput {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface CommandOutputOptions {
  timeoutMs?: number;
  /**
   * Run via the platform shell. Only pass `true` for a **trusted, static** `bin`
   * + `args` (no user input) — it is required on Windows to invoke `.cmd` shims
   * such as `npm`/`code`, which `spawn` cannot resolve directly.
   */
  shell?: boolean;
}

/**
 * Run `bin args` with no stdin, capturing stdout/stderr. Never throws — a missing
 * binary, a non-zero exit, or a timeout all resolve to `{ ok: false, … }`, which
 * is exactly what a "probe" (does this tool exist / what version) wants. By
 * default args are passed as an argv array with no shell, so there is no escaping
 * concern; see {@link CommandOutputOptions.shell}.
 */
export async function getCommandOutput(
  bin: string,
  args: string[] = [],
  options: CommandOutputOptions = {},
): Promise<CommandOutput> {
  const { timeoutMs = 5_000, shell = false } = options;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CommandOutput): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawn(bin, args, { shell, windowsHide: true });
    } catch {
      finish({ ok: false, stdout: '', stderr: '', code: null });
      return;
    }

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, stdout, stderr, code: null });
    }, timeoutMs);

    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', () => {
      clearTimeout(timer);
      finish({ ok: false, stdout, stderr, code: null });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, stdout, stderr, code });
    });
  });
}
