import { spawn } from 'node:child_process';

/**
 * Helpers for talking to a locally-installed AI CLI. We never put the prompt on
 * the command line — it's written to the child's stdin — so there is no shell
 * escaping or argv-length concern, and the only argv values are static flags.
 */

// `commandExists` is a general process probe shared with `replicax doctor`; it
// lives in core/process.ts and is re-exported here for existing callers.
export { commandExists } from '@/core/process';

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
