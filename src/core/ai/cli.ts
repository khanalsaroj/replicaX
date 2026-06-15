import { spawn } from 'node:child_process';

/**
 * Helpers for talking to a locally-installed AI CLI. We never put the prompt on
 * the command line — it's written to the child's stdin — so there is no shell
 * escaping or argv-length concern, and the only argv values are static flags.
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

export interface RunResult {
  stdout: string;
  code: number | null;
}

/**
 * Run `bin args`, feeding `input` on stdin and capturing stdout. Rejects on a
 * spawn error, a non-zero exit with no usable output, or a timeout.
 */
export async function runWithStdin(
  bin: string,
  args: string[],
  input: string,
  timeoutMs = 120_000,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: true, windowsHide: true });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${bin} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`${bin} exited with code ${code}: ${stderr.trim() || 'no output'}`));
      } else {
        resolve({ stdout, code });
      }
    });

    child.stdin.end(input);
  });
}
