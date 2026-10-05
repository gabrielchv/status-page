/**
 * Derive a URL-safe slug from a monitor name. Falls back to a random suffix
 * when the input yields an empty slug (e.g. all non-ASCII characters).
 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  if (base.length > 0) return base;

  return `monitor-${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureUniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  let i = 2;
  while (taken.has(slug)) {
    slug = `${base}-${i}`;
    i += 1;
  }
  return slug;
}
