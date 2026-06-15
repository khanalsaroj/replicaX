import pc from 'picocolors';

/**
 * Minimal leveled logger built on picocolors. Everything diagnostic goes to
 * stderr so that machine-readable output (e.g. `inspect --json`) can own stdout.
 */

let verbose = false;

export function setVerbose(value: boolean): void {
  verbose = value;
}

export function isVerbose(): boolean {
  return verbose;
}

function write(line: string): void {
  process.stderr.write(line + '\n');
}

export const logger = {
  /** Plain informational line. */
  info(message: string): void {
    write(`${pc.blue('ℹ')} ${message}`);
  },
  success(message: string): void {
    write(`${pc.green('✔')} ${message}`);
  },
  warn(message: string): void {
    write(`${pc.yellow('⚠')} ${pc.yellow(message)}`);
  },
  error(message: string): void {
    write(`${pc.red('✖')} ${pc.red(message)}`);
  },
  /** A nested detail line, only shown in verbose mode. */
  detail(message: string): void {
    if (verbose) write(`  ${pc.dim(message)}`);
  },
  /** Always-shown dim hint, e.g. follow-up suggestions. */
  hint(message: string): void {
    write(`  ${pc.dim(message)}`);
  },
  /** A blank separator line. */
  newline(): void {
    write('');
  },
  /** Write a raw line to stdout (for results meant to be piped/captured). */
  out(line: string): void {
    process.stdout.write(line + '\n');
  },
};

export { pc };
