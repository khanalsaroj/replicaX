/**
 * An expected, user-facing error. The CLI prints its message cleanly (no stack
 * trace) and exits non-zero. Use this for "the user did something we can't
 * proceed with" situations — missing profile, bad path, conflict, etc.
 */
export class ReplicaxError extends Error {
  /** Optional follow-up lines shown under the main message as hints. */
  readonly hints: string[];

  constructor(message: string, hints: string[] = []) {
    super(message);
    this.name = 'ReplicaxError';
    this.hints = hints;
  }
}
