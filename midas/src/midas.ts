import type { Order } from "./types";

/**
 * The player's login tickets (for example openkey and pfkey) that Midas
 * needs to act on the player's account.
 *
 * Why never stored: they work like short-lived passwords. Keeping them in
 * the database would leak them on a breach, and they expire anyway.
 */
export interface UserSession {
  openkey: string;
  pfkey: string;
}

/**
 * The outcome of a call to Midas, sorted by what we must do next.
 *
 * - ok:        it happened.
 * - rejected:  it definitely did not happen (for example, not enough coins).
 * - unknown:   we cannot tell (timeout, or Midas answered "system busy").
 *              Money may or may not have moved.
 * - needLogin: the player's ticket expired. We need a fresh one.
 */
export type CallResult =
  | { kind: "ok" }
  | { kind: "rejected"; reason: string }
  | { kind: "unknown"; reason: string }
  | { kind: "needLogin" };

/**
 * Our server's view of the Midas server API.
 *
 * Not implemented in this demo. A real implementation signs every request
 * with the AppKey from Midas. The AppKey lives only on our servers: inside
 * a game client it could be extracted and used to forge requests.
 *
 * Endpoint names, parameters and the signing algorithm are in Midas's
 * own documentation, which is not public. See README "Assumptions".
 */
export interface MidasClient {
  /**
   * Deduct `order.amount` coins from the player, using `order.billNo`.
   *
   * Midas promises that calls with the same bill_no within 48 hours deduct
   * only once. That is what makes retrying after "unknown" safe.
   *
   * How Midas error codes map to results (codes from the public WeChat
   * mini-game Midas docs):
   *   0      → ok
   *   90012  → ok. "Duplicate bill_no": an earlier try already deducted.
   *            (Assumption: the docs do not say this outright.)
   *   90013  → rejected, not enough coins
   *   90018  → rejected, bad parameter
   *   90016  → needLogin
   *   -1, timeout, network error → unknown
   */
  deduct(order: Order, session: UserSession): Promise<CallResult>;

  /**
   * Give back the coins taken for `order.billNo`.
   * Used only when a paid item can never be delivered.
   * Assumed to be safe to repeat for the same bill_no, like deduct.
   */
  cancelDeduct(order: Order, session: UserSession): Promise<CallResult>;

  /**
   * Check that a delivery notice really came from Midas and was not
   * changed on the way. Uses the AppKey.
   *
   * Why this matters: the notice URL is public. Without this check, anyone
   * could send "player X paid for item Y" and get free items.
   */
  verifyNotice(params: Record<string, string>): boolean;

  /** Read the coin balance, for showing in the shop. Not used by the core flow. */
  getBalance(openid: string, zoneId: string, pf: string, session: UserSession): Promise<number>;

  /** Give free coins, for events or compensation. Not used by the core flow. */
  present(openid: string, zoneId: string, pf: string, amount: number, billNo: string): Promise<CallResult>;
}
