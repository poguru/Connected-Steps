/**
 * Pagination helpers for Supabase queries.
 *
 * Supabase PostgREST defaults to max 1000 rows per request. Use paginateAll()
 * to transparently load every row regardless of total count.
 */

export const PAGE_SIZE = 1000;

export interface PageResult<T> {
  rows:  T[];
  pages: number;
}

/**
 * Repeatedly calls `fetcher(from, to)` with increasing offsets until a
 * partial page is returned (fewer than PAGE_SIZE rows), then returns the
 * combined dataset along with the page count for logging.
 *
 * Usage:
 *   const { rows, pages } = await paginateAll((from, to) =>
 *     db.from("users").select("email").order("email").range(from, to)
 *   );
 *
 * Throws if any page returns an error.
 */
export async function paginateAll<T>(
  fetcher:  (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = PAGE_SIZE,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  let pages = 0;
  let from  = 0;

  for (;;) {
    const { data, error } = await fetcher(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    pages++;
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return { rows, pages };
}
