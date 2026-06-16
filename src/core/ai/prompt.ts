import type {SkillTarget} from '@/config/ai-targets';

/**
 * Build the single prompt sent to the AI provider. Everything the model sees is
 * derived from the project's *setup* only — the deterministic skill (already a
 * faithful summary of stack, commands, tooling, structure, and conventions),
 * the captured config-file paths, and the package scripts. No source files or
 * secrets are ever included, which preserves ReplicaX's core guarantee.
 */
export interface SkillPromptArgs {
    slug: string;
    /** The target's entry filename, e.g. "SKILL.md" or "<slug>.md". */
    entryFile: string;
    /** Where the skill will be installed, for the model's context. */
    entryPath: string;
    target: SkillTarget;
    /** The deterministic skill markdown — ground truth the model refines. */
    analysis: string;
    /** Captured config-file paths (setup only). */
    toolingPaths: string[];
    /** package.json scripts. */
    scripts: Record<string, string>;
    /**
     * Contents of a project-root `SKILL.md`, when the user ships one. Treated as an
     * authoritative template: the model preserves its structure, headings, and
     * explicit instructions, and refines/fills it in from the analysis. Undefined
     * (or blank) when the project has no root SKILL.md.
     */
    rootSkill?: string;
}

export function buildSkillPrompt(args: SkillPromptArgs): string {
    const scripts = Object.entries(args.scripts)
        .map(([name, cmd]) => `  ${name}: ${cmd}`)
        .join('\n');
    const tooling = args.toolingPaths.map((p) => `  ${p}`).join('\n');

    // A project-root SKILL.md (if present) is the user's preferred template. When
    // supplied, it becomes the base the model must honour rather than starting from
    // scratch, plus an extra rule pinning that behaviour.
    const template = args.rootSkill?.trim();
    const templateRule = template
        ? "\n- A USER SKILL TEMPLATE (the project's root SKILL.md) is provided below. Use it as the BASE for the entry file: preserve its headings, structure, tone, and any explicit instructions, and refine/fill it in using the PROJECT ANALYSIS. Do not drop content the author put there; do not contradict it."
        : '';
    const templateSection = template
        ? `\nUSER SKILL TEMPLATE (project root SKILL.md — use this as the base; preserve and refine, keep "name: ${args.slug}" in the frontmatter):\n${template}\n`
        : '';

    return `You are an expert developer-tooling assistant. Generate a high-quality "skill" for an AI coding assistant: a document (plus optional supporting files) that teaches the assistant how to work productively in a specific software project.

STRICT RULES:
- Base everything ONLY on the PROJECT ANALYSIS below. Do not invent tools, frameworks, commands, or files that are not present in the analysis.
- Output ONLY a single JSON object — no prose, no markdown code fences, no commentary before or after.

OUTPUT SHAPE (exactly this JSON structure):
{"files":[{"path":"<relative path>","content":"<file contents>"}]}

REQUIREMENTS:
- Include exactly one entry file whose path is "${args.entryFile}". It MUST start with YAML frontmatter containing "name: ${args.slug}" and a concise single-line "description", then clear markdown covering: tech stack, setup/install, common commands, tooling, project structure, and conventions.
- You MAY add a few supporting files under "references/" (e.g. "references/commands.md") when genuinely useful. Keep the bundle small and focused.
- All paths must be relative, use forward slashes, and must NOT contain ".." or be absolute.
- This skill targets ${args.target.label} and will be installed at ${args.entryPath}.${templateRule}

PROJECT ANALYSIS (ground truth — refine and expand this, do not contradict it):
${args.analysis}
${templateSection}
CAPTURED CONFIG FILES:
${tooling || '  (none)'}

PACKAGE SCRIPTS:
${scripts || '  (none)'}
`;
}
