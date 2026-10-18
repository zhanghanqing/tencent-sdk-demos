import type { UserSession } from "./midas";
import { advance, type Ctx } from "./order";

/**
 * Background job, run every minute or so. Finishes orders that a crash or
 * a temporary error left in PAID: the coins are taken but the item is not
 * given yet.
 *
 * Why only PAID: delivering needs nothing from Midas, so no player ticket
 * is needed. PAYING and REFUNDING both call Midas on the player's behalf
 * and must wait for a fresh ticket (see resumeOnLogin).
 *
 * `olderThanMs` skips orders a live request is still working on.
 */
export async function recoverPaidOrders(ctx: Ctx, olderThanMs: number): Promise<void> {
  for (const order of await ctx.db.findStuck("PAID", olderThanMs)) {
    try {
      await advance(ctx, order.billNo, { viaRecovery: true });
    } catch (err) {
      await ctx.db.recordAttempt(order.billNo, String(err));
    }
  }
}

/**
 * Called right after a player logs in. Orders stuck in PAYING or REFUNDING
 * could not talk to Midas without a valid ticket. Now we have one.
 *
 * Why this is safe: PAYING retries the deduction with the same bill_no,
 * which Midas deducts only once. So a player who was charged gets PAID and
 * then the item, and a player who was not charged is charged exactly once.
 * Orders older than the retry window are left for a human (see pay()).
 */
export async function resumeOnLogin(ctx: Ctx, openid: string, session: UserSession): Promise<void> {
  for (const order of await ctx.db.findOpenOrders(openid)) {
    try {
      await advance(ctx, order.billNo, { session, viaRecovery: true });
    } catch (err) {
      await ctx.db.recordAttempt(order.billNo, String(err));
    }
  }
}
