import { select } from '@inquirer/prompts';
import { logger } from '@/utils/logger';

export type ConflictPolicy = 'prompt' | 'overwrite' | 'skip';
export type ConflictDecision = 'overwrite' | 'skip';

/**
 * Decides what to do when a file to be written already exists. In `prompt` mode
 * it asks the user per-file (with "all" shortcuts that latch). When stdin is not
 * a TTY, prompting is impossible, so it falls back to the safe choice: skip.
 */
export class ConflictResolver {
  private blanket: ConflictDecision | null = null;
  private readonly interactive: boolean;

  constructor(private readonly policy: ConflictPolicy) {
    this.interactive = Boolean(process.stdin.isTTY);
  }

  async resolve(relPath: string): Promise<ConflictDecision> {
    if (this.policy === 'overwrite') return 'overwrite';
    if (this.policy === 'skip') return 'skip';
    if (this.blanket) return this.blanket;

    if (!this.interactive) {
      logger.warn(`${relPath} exists; skipping (non-interactive shell, use --force to overwrite).`);
      return 'skip';
    }

    const answer = await select<ConflictDecision | 'overwrite-all' | 'skip-all'>({
      message: `${relPath} already exists. What should ReplicaX do?`,
      choices: [
        { name: 'Skip this file', value: 'skip' },
        { name: 'Overwrite this file', value: 'overwrite' },
        { name: 'Skip all remaining conflicts', value: 'skip-all' },
        { name: 'Overwrite all remaining conflicts', value: 'overwrite-all' },
      ],
    });

    if (answer === 'overwrite-all') {
      this.blanket = 'overwrite';
      return 'overwrite';
    }
    if (answer === 'skip-all') {
      this.blanket = 'skip';
      return 'skip';
    }
    return answer;
  }
}
