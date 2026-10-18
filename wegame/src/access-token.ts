import type { CachedAccessToken } from "./types";

/**
 * Hands out a valid WeGame access_token to any server that needs one.
 *
 * The rules it must follow, all from the "请求访问令牌" section:
 * - A token lives `expires_in` seconds (3600 today). Do not hard-code 3600.
 * - Requesting a new token makes the OLD one stop working within 5 minutes.
 *
 * The second rule is the trap. If every game server fetched its own token,
 * each fetch would kill the token the other servers are using. With 20
 * servers refreshing every hour, someone's token dies every few minutes,
 * and logins fail at random with 403. So:
 *
 * 1. ONE refresher for the whole fleet. Servers read the token from a
 *    shared cache (Redis key `wegame:access_token`). Only the holder of a
 *    short lock (`wegame:access_token:lock`, SET NX PX) may fetch a new one.
 * 2. Refresh EARLY, at `refreshAt` (about 80% of the lifetime). Readers
 *    keep using the current token meanwhile; it stays valid.
 * 3. After a refresh, the old token stops working at some point within
 *    5 minutes. Servers that read it a moment ago usually finish fine,
 *    but nobody can count on it. That is what rule 4 is for.
 * 4. On a 403 invalid_token, a server calls `invalidate(badToken)` and asks
 *    again. `invalidate` only refreshes if the cache still holds that same
 *    bad token, so 20 servers hitting 403 at once cause ONE refresh, not 20.
 *
 * Not implemented in this demo.
 */
export interface AccessTokenProvider {
  /**
   * Return a token that is valid now.
   * Fast path: read the cache. Slow path (missing, or past refreshAt): take
   * the lock, fetch, write the cache, release. If another server holds the
   * lock, wait briefly and read the cache again.
   */
  get(): Promise<string>;

  /**
   * Report that `token` was rejected with 403 invalid_token.
   * Refreshes only if the cache still holds `token` (compare-and-set),
   * so many reports of the same bad token cause a single refresh.
   */
  invalidate(token: string): Promise<void>;

  /** For monitoring: what is cached right now. */
  peek(): Promise<CachedAccessToken | null>;
}

/** Refresh at this fraction of the token's lifetime. */
export const REFRESH_AT_FRACTION = 0.8;

/** How long one server may hold the refresh lock. */
export const REFRESH_LOCK_MS = 10_000;
