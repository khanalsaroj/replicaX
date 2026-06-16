/**
 * Convert an arbitrary name into a safe kebab-case slug: lowercase, with runs of
 * non-alphanumeric characters collapsed to single dashes and the ends trimmed.
 * Falls back to `fallback` when nothing usable remains (e.g. `"***"`).
 */
export function slugify(input: string, fallback = 'project'): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}
