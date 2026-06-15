import { z } from 'zod';
import { safeJoinable } from '@/utils/paths';

/**
 * Parse and validate the AI's response into a set of files to write. The model
 * is asked for strict JSON, but real CLIs sometimes wrap output in prose or
 * code fences, so we extract the JSON object defensively. Every path is run
 * through {@link safeJoinable} — a hostile path rejects the whole bundle, so a
 * compromised or confused model can never escape the skill directory.
 */
const SkillFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const SkillBundleSchema = z.object({
  files: z.array(SkillFileSchema).min(1),
});

export interface SkillFile {
  /** POSIX-relative path within the skill's bundle directory. */
  path: string;
  content: string;
}

/**
 * Pull the JSON object out of raw model output. Models often wrap the response
 * in a ```json fence and the skill content itself contains ``` code fences, so
 * we slice from the first `{` to the last `}` rather than matching fences —
 * inner fences and braces sit harmlessly inside JSON string values.
 */
export function extractJson(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return raw.slice(start, end + 1);
}

/**
 * Turn raw model output into validated, path-safe skill files, or null if the
 * output isn't a usable bundle (caller then falls back to the built-in template).
 */
export function parseSkillBundle(raw: string): SkillFile[] | null {
  const json = extractJson(raw);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  const result = SkillBundleSchema.safeParse(parsed);
  if (!result.success) return null;

  const files: SkillFile[] = [];
  for (const file of result.data.files) {
    const safe = safeJoinable(file.path);
    if (!safe) return null; // hostile path → reject the entire bundle
    files.push({ path: safe, content: file.content });
  }
  return files;
}
