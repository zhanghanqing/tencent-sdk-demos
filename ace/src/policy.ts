import type { Label, PenaltyKind, Scene } from "./types";

/**
 * How strict each scene is. This table is the heart of the design: the
 * same verdict leads to different actions depending on where the content
 * will be seen.
 *
 * Two questions per scene:
 *   1. How long may we wait for the service?
 *   2. If it does not answer in time, do we let content through?
 *
 * Names are public and permanent, so we may wait, and we never let an
 * unchecked name through ("fail closed"). Chat is fast and short-lived, so
 * we wait briefly, and on a timeout we fall back to the local blocklist and
 * check the line again afterwards ("fail open, check later").
 */
export interface ScenePolicy {
  timeoutMs: number;
  onTimeout: "hold" | "local_only";
  onReview: "hold" | "deliver_masked";
  onBlock: "reject" | "sender_only";
  /** Run the check again later when the first answer was local-only. */
  recheckAfterTimeout: boolean;
  /** Attach recent messages (SessionId) so the service sees context. */
  useContext: boolean;
}

export const SCENE_POLICIES: Record<Exclude<Scene, "voice_live" | "voice_message">, ScenePolicy> = {
  nickname:   { timeoutMs: 2000, onTimeout: "hold",       onReview: "hold",           onBlock: "reject",      recheckAfterTimeout: false, useContext: false },
  clan_name:  { timeoutMs: 2000, onTimeout: "hold",       onReview: "hold",           onBlock: "reject",      recheckAfterTimeout: false, useContext: false },
  world_chat: { timeoutMs: 300,  onTimeout: "local_only", onReview: "deliver_masked", onBlock: "sender_only", recheckAfterTimeout: true,  useContext: true  },
  team_chat:  { timeoutMs: 300,  onTimeout: "local_only", onReview: "deliver_masked", onBlock: "sender_only", recheckAfterTimeout: true,  useContext: true  },
  whisper:    { timeoutMs: 300,  onTimeout: "local_only", onReview: "deliver_masked", onBlock: "sender_only", recheckAfterTimeout: true,  useContext: true  },
};

/**
 * Why "sender_only" for blocked chat: the sender sees their own line as
 * sent, nobody else does. A sender who gets "refused" back learns exactly
 * which spelling trips the filter and tries the next one. One who sees
 * nothing change has nothing to learn from. (A product choice; "reject"
 * is the honest alternative.)
 */

/** How serious each label is. Drives penalty points. */
export const LABEL_SEVERITY: Record<Label, number> = {
  normal: 0,
  ad: 1,          // spam and advertising
  abuse: 2,       // insults, profanity
  custom: 2,      // our own keyword list
  other: 2,
  moan: 3,
  porn: 3,
  illegal: 4,
  terrorism: 5,
  politics: 5,
};

/**
 * Penalty ladder. Points = sum of severities of a player's violations in
 * the last 7 days. The first matching rung (from the top) applies.
 *
 * Why points over a window and not "3 strikes forever": one bad evening
 * should cool down; a habit should escalate.
 */
export const PENALTY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const PENALTY_LADDER: { minPoints: number; kind: PenaltyKind; durationMs: number | null }[] = [
  { minPoints: 20, kind: "account_review", durationMs: null },          // a human looks
  { minPoints: 12, kind: "chat_ban",       durationMs: 7 * 86_400_000 },
  { minPoints: 8,  kind: "mute",           durationMs: 86_400_000 },
  { minPoints: 4,  kind: "mute",           durationMs: 10 * 60_000 },
  { minPoints: 2,  kind: "warn",           durationMs: 0 },
];

/**
 * A verdict only counts toward penalties when the service was sure.
 * Review-level verdicts are not punished automatically: a human decides.
 */
export const PUNISH_MIN_SCORE = 80;

/**
 * Cache verdicts of short texts. Chat is full of repeats ("gg", "nice",
 * "go go go"); checking each one again costs money and quota (the text
 * service's default limit is 1000 requests/second per account).
 * Only short texts: long ones rarely repeat. Not used when context is
 * attached, because then the same words can mean different things.
 */
export const CACHE_MAX_CHARS = 32;
export const CACHE_TTL_MS = 10 * 60_000;
