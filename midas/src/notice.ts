import { advance, type Ctx } from "./order";

/**
 * Handle Midas's delivery notice for a direct-buy order: "the player has
 * paid, please deliver".
 *
 * Returns true when we may answer "success" to Midas. Midas keeps sending
 * the same notice until it gets "success", so this handler must be safe to
 * run many times for one order. It is: the PAYING → PAID move is a
 * conditional update, and delivery is guarded by item_grants.
 *
 * Parameter names (billno, openid, amt) are placeholders. The real names
 * and the reply format are in Midas's documentation. See README.
 */
export async function onDeliveryNotice(ctx: Ctx, params: Record<string, string>): Promise<boolean> {
  // 1. Anyone can call this URL. Only a correctly signed notice counts.
  if (!ctx.midas.verifyNotice(params)) return false;

  // 2. We deliver what OUR order says, not what the notice says.
  //    The notice must agree with the order we created.
  const order = await ctx.db.getOrder(params.billno);
  if (!order || order.mode !== "direct") return false;
  if (params.openid !== order.openid || Number(params.amt) !== order.amount) {
    return false; // signed but inconsistent: raise an alert, never deliver
  }

  // 3. Record the payment. If a repeated notice already did this, the
  //    conditional update simply changes nothing.
  await ctx.db.transition(order.billNo, "PAYING", "PAID");

  // 4. Deliver. Temporary errors throw, we answer failure, and Midas sends
  //    the notice again later.
  const status = await advance(ctx, order.billNo);

  // REFUNDING also counts: the money arrived and the order is now ours to
  // settle with support. Asking Midas to resend would not help.
  return status === "DELIVERED" || status === "REFUNDING";
}
