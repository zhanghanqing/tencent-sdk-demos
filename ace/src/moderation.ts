import type { Decision, PlayerId, Scene, TextItem, Verdict } from "./types";

/**
 * The game server's moderation gate. Every chat line and every name passes
 * through it BEFORE anyone else can see it.
 *
 * Why on the server: a filter in the client can be switched off by a
 * modified client. The server is the only place every message must pass.
 *
 * Not implemented in this demo. The steps are the contract; README
 * "Checking a chat line" draws them.
 */
export interface ModerationService {
  /**
   * Check one chat line and decide what to do with it.
   *
   *  1. Muted or chat-banned sender? → reject, without calling anyone.
   *  2. Normalize the text (NFKC, lower case, drop zero-width and
   *     separator characters) so "ｆ.u.c.k" and "fuck" look the same.
   *  3. Local blocklist on the normalized text. A hit → Block at once:
   *     no network call, no cost.
   *  4. Short text without context? Look in the verdict cache.
   *  5. Ask the text service, within the scene's timeoutMs.
   *       answered → apply the scene policy to the verdict
   *       timed out → "local_only": the blocklist already passed it, so
   *                   deliver, and queue a recheck
   *  6. Record the verdict (moderation_log). If it was a confident
   *     violation, add a violation and let PenaltyService decide.
   *
   * Never throws to the caller: whatever happens, it returns a Decision.
   */
  checkChat(item: TextItem): Promise<Decision>;

  /**
   * Check a new nickname or clan name.
   * Same steps, but with the stricter name policy: a timeout or a Review
   * verdict means "hold". The player keeps the old name while a human
   * looks, and the new name is never shown unchecked.
   */
  checkName(item: TextItem): Promise<Decision>;

  /**
   * Re-check a chat line that went out on the local blocklist alone
   * because the service timed out. If it turns out to violate, the line
   * is withdrawn from clients that still show it, and the sender gets a
   * violation like any other.
   */
  recheck(itemId: string): Promise<void>;

  /**
   * Handle a GME voice moderation callback.
   *
   *  1. Verify the signature on the raw body. Bad signature → 403, stop.
   *  2. For each violating piece, build a key TaskId + PieceStartTime and
   *     insert it into voice_results. Already there → skip: the same
   *     callback was delivered twice.
   *  3. Map the speaker (OpenId as we reported it to GME) to our player.
   *  4. Record a violation with the evidence URL; PenaltyService decides.
   *  5. Answer HTTP 200, which the docs treat as "delivered".
   *
   * Voice is checked after it was heard, so voice moderation can only
   * punish, never prevent. That is why it feeds the same penalty ladder.
   */
  onVoiceCallback(rawBody: Buffer, signatureParam: string): Promise<{ http: 200 | 403 }>;
}

/**
 * Punishments. One place decides them, for text and voice alike.
 * Not implemented in this demo.
 */
export interface PenaltyService {
  /**
   * Add a violation and apply the ladder in policy.ts:
   *   points = sum of LABEL_SEVERITY over the last PENALTY_WINDOW_MS
   *   the first rung whose minPoints <= points applies
   * Only verdicts with score >= PUNISH_MIN_SCORE count; Review verdicts go
   * to a human instead.
   *
   * Why one service for both text and voice: a player who is muted for
   * abusive chat should not simply switch to voice, and the reverse.
   */
  recordViolation(playerId: PlayerId, scene: Scene, verdict: Verdict, evidence: { itemId?: string; url?: string }): Promise<void>;

  /** Is the player muted or chat-banned right now? Read on every message. */
  activePenalty(playerId: PlayerId): Promise<{ kind: string; endsAt: number | null } | null>;

  /** A human lifts a penalty, e.g. after an appeal. Kept in history. */
  lift(penaltyId: string, by: string, note: string): Promise<void>;
}

/**
 * Words we block without asking the service: obvious slurs, known spam
 * domains, our own game-specific terms. Also our fallback when the
 * service is down.
 */
export interface LocalBlocklist {
  /** Returns the matched words, empty if none. Input must be normalized. */
  match(normalized: string): string[];
  /** Reload from the moderation_terms table, without a restart. */
  reload(): Promise<void>;
}
