import { Confidence, defineDetector, hit, type Detector } from '../types';

/**
 * Editor + AI-assistant detectors. None of these folders are *captured* (IDE
 * folders are pruned from profiles) — they are detected purely to report what a
 * project is set up for. VS Code is a plain editor; Cursor / Claude Code /
 * Windsurf are AI coding assistants (category `ai`).
 */
export const editorDetectors: Detector[] = [
  defineDetector({ id: 'vscode', name: 'VS Code', category: 'editor' }, (ctx) =>
    ctx.hasUnder('.vscode') ? hit(Confidence.Confirmed, '.vscode/') : null,
  ),
  defineDetector({ id: 'cursor', name: 'Cursor', category: 'ai' }, (ctx) => {
    if (ctx.hasUnder('.cursor')) return hit(Confidence.Confirmed, '.cursor/');
    if (ctx.has('.cursorrules')) return hit(Confidence.Confirmed, '.cursorrules');
    return null;
  }),
  defineDetector({ id: 'claude-code', name: 'Claude Code', category: 'ai' }, (ctx) => {
    if (ctx.hasUnder('.claude')) return hit(Confidence.Confirmed, '.claude/');
    if (ctx.has('CLAUDE.md')) return hit(Confidence.Confirmed, 'CLAUDE.md');
    return null;
  }),
  defineDetector({ id: 'windsurf', name: 'Windsurf', category: 'ai' }, (ctx) => {
    if (ctx.hasUnder('.windsurf')) return hit(Confidence.Confirmed, '.windsurf/');
    if (ctx.has('.windsurfrules')) return hit(Confidence.Confirmed, '.windsurfrules');
    return null;
  }),
];
