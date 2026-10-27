import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** Shorter than this and the key is guessable; the endpoint stays off. */
export const MIN_KEY_LENGTH = 32;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Whether `candidate` is the configured ROSTER_MCP_KEY. The key rides in the
 * URL path because Claude's custom connectors (phone and web) take a URL and
 * nothing else. Hashing first makes the compare constant-time whatever the
 * candidate's length. Unset or too-short key: always false.
 */
export function isValidMcpKey(candidate: string, configured = process.env.ROSTER_MCP_KEY): boolean {
  if (!configured || configured.length < MIN_KEY_LENGTH) return false;
  return timingSafeEqual(digest(candidate), digest(configured));
}
