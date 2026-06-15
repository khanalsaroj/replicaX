/**
 * Targets for `replicax init-skill`. Each target describes how a given AI coding
 * assistant in the AGENTS.md / "skills" ecosystem expects a skill on disk: where
 * the skill's markdown file lives and how the assistant discovers it.
 *
 * The skill *content* (YAML frontmatter + body) is identical across targets —
 * only the on-disk location differs — so adding support for a new assistant is a
 * single entry here. This mirrors `config/supported-files.ts`: one catalogue the
 * rest of the code consults.
 */
export interface SkillTarget {
  /** Stable id used on the CLI (`--target <id>`). */
  id: string;
  /** Human-friendly label for display. */
  label: string;
  /**
   * POSIX-relative path of the skill's primary markdown file for a given skill
   * slug, e.g. codex → `.codex/skills/<slug>/SKILL.md`.
   */
  entryPath: (slug: string) => string;
  /** One-line note about where/how the assistant discovers the skill. */
  note: string;
}

export const SKILL_TARGETS: SkillTarget[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    entryPath: (slug) => `.claude/skills/${slug}/SKILL.md`,
    note: 'Claude Code loads skills from .claude/skills/<name>/SKILL.md',
  },
  {
    id: 'codex',
    label: 'OpenAI Codex CLI',
    entryPath: (slug) => `.codex/skills/${slug}/SKILL.md`,
    note: 'Codex CLI loads project skills from .codex/skills/<name>/SKILL.md',
  },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    entryPath: (slug) => `.agents/skills/${slug}.md`,
    note: 'Antigravity discovers skills under .agents/skills/',
  },
];

/** Map from target id to its definition, for quick lookup. */
export const SKILL_TARGET_BY_ID = new Map(SKILL_TARGETS.map((t) => [t.id, t]));

/** All valid `--target` ids, for help text and error hints. */
export const SKILL_TARGET_IDS = SKILL_TARGETS.map((t) => t.id);
