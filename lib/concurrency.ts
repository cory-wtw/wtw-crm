/**
 * Run `worker` over `items` with at most `limit` in flight, preserving input
 * order in the results.
 *
 * Its own module rather than a helper inside the script that uses it: anything
 * importing that script also initializes the Firebase Admin SDK, which makes
 * this untestable in the same breath as making it trivial to get wrong.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function drain(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => drain()),
  );
  return results;
}
