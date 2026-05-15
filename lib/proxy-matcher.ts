/**
 * Source of truth for which paths the proxy (middleware) processes. Mirrors
 * the pattern used in `proxy.ts` so we can unit-test it without spinning up
 * Next's matcher pipeline.
 *
 * Run the proxy for everything EXCEPT:
 *   - /_next/* internals
 *   - /favicon.ico
 *   - any path ending in a common static image extension
 */
export const PROXY_MATCHER_PATTERN =
  "/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)";

const PROXY_MATCHER_REGEX =
  /^\/(?:(?!_next\/|favicon\.ico|.*\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)$/;

export function shouldProcessByProxy(path: string): boolean {
  return PROXY_MATCHER_REGEX.test(path);
}
