/**
 * Merge a patch into the current query string. Empty values remove their key
 * unless the key is listed in `keepEmpty` (for filters whose default is not
 * empty, where "" is a deliberate choice such as "all statuses"). Every other
 * key is kept, so a page's own filters never wipe the global filter bar
 * (region, disease, from, to, group) and vice versa.
 */
export function mergeSearch(prev: URLSearchParams, patch: Record<string, string | number | null | undefined>, keepEmpty: readonly string[] = []): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const [k, v] of Object.entries(patch)) {
    if (v === "" && keepEmpty.includes(k)) next.set(k, "");
    else if (v === undefined || v === null || v === "") next.delete(k);
    else next.set(k, String(v));
  }
  return next;
}
