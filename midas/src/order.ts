import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import type { CallResult, MidasClient, UserSession } from "./midas";
import type { GrantSource, Order, OrderStatus, PurchaseRequest } from "./types";

export interface Ctx {
  db: Db;
  midas: MidasClient;
}

/**
 * Turn a purchase request into a saved order in PAYING.
 * Works for both pay modes; the product decides which one.
 *
 * Why the order is saved before Midas is called: if we crash right after
 * calling Midas, the saved order is how we find out about it again.
 */
export async function createOrder(db: Db, req: PurchaseRequest): Promise<Order> {
  // Zero, negative or fractional quantities could produce odd amounts.
  if (!Number.isInteger(req.quantity) || req.quantity <= 0) {
    throw new Error("invalid quantity");
  }

  // Price comes from our catalog, never from the client.
  const product = await db.getProduct(req.itemId);
  if (!product || !product.onSale) throw new Error("item not on sale");

  const order: Order = {
    ...req,
    billNo: newBillNo(),
    mode: product.mode,
    amount: product.price * req.quantity,
    status: "PAYING",
    createdAt: Date.now(),
  };
  if (await db.insertOrder(order)) return order;

  // Same tap arrived twice: hand back the first order instead of a new one.
  return (await db.findOrderByRequest(req.openid, req.requestId))!;
}

/**
 * Buy an item with hosted game coins: create the order, then push it
 * forward, retrying a few times if Midas's answer is unknown.
 *
 * Returns the status the order reached. PAYING means "still processing":
 * the client shows a waiting state and asks again later. It never means
 * failure, because the coins may already be gone.
 *
 * If delivery hits a temporary database error, this throws. The order is
 * already PAID in the database, so the recovery job delivers it later.
 */
export async function purchase(
  ctx: Ctx,
  req: PurchaseRequest,
  session: UserSession,
): Promise<{ billNo: string; status: OrderStatus }> {
  const order = await createOrder(ctx.db, req);
  // Direct-buy orders are paid in the client SDK; Midas notifies us later.
  if (order.mode !== "coins") return { billNo: order.billNo, status: order.status };

  let status = order.status;
  for (let i = 0; i < MAX_TRIES; i++) {
    status = await advance(ctx, order.billNo, { session });
    if (status !== "PAYING" && status !== "REFUNDING") break;
    await sleep(RETRY_DELAY_MS * (i + 1));
  }
  return { billNo: order.billNo, status };
}

export interface AdvanceOptions {
  /** Needed for any step that calls Midas for the player. */
  session?: UserSession;
  /** Marks deliveries made by the recovery job, for auditing. */
  viaRecovery?: boolean;
}

/**
 * Move one order forward as far as it can go right now, and return the
 * status where it stopped.
 *
 * Every path uses this: the buyer's request, the Midas delivery notice,
 * and the recovery jobs. So the rules live in one place.
 *
 * Safe to call any number of times, from any number of processes at once:
 * Midas calls are safe to repeat with the same bill_no, and every status
 * change is a conditional update that only one caller can win.
 */
export async function advance(ctx: Ctx, billNo: string, opts: AdvanceOptions = {}): Promise<OrderStatus> {
  for (;;) {
    const order = await ctx.db.getOrder(billNo);
    if (!order) throw new Error(`unknown order ${billNo}`);

    switch (order.status) {
      case "PAYING":
        // Direct buy: only Midas's notice can say it was paid.
        if (order.mode === "direct" || !opts.session) return order.status;
        if (!(await pay(ctx, order, opts.session))) return order.status;
        break;

      case "PAID":
        await deliver(ctx.db, order, opts.viaRecovery ? "recovery" : order.mode);
        break;

      case "REFUNDING":
        // Direct-buy refunds go through Midas/channel support, not this API.
        if (order.mode === "direct" || !opts.session) return order.status;
        if (!(await refund(ctx, order, opts.session))) return order.status;
        break;

      default:
        return order.status; // DELIVERED, FAILED, REFUNDED: final
    }
    // A step was taken (by us or by a racing caller). Reload and go on.
  }
}

/**
 * PAYING → PAID or FAILED. Returns false if the order must stay PAYING.
 *
 * Why "unknown" never becomes FAILED: the coins may already be gone.
 * Marking the order failed would take the player's money for nothing.
 * We keep it PAYING and retry later with the same bill_no.
 *
 * Why the age check: Midas only promises "same bill_no, deducted once"
 * for 48 hours. After that a retry could charge the player a second time,
 * so old orders go to a human to settle against Midas's records instead.
 */
async function pay(ctx: Ctx, order: Order, session: UserSession): Promise<boolean> {
  if (Date.now() - order.createdAt > SAFE_RETRY_WINDOW_MS) {
    await ctx.db.recordAttempt(order.billNo, "retry window passed: reconcile by hand");
    return false;
  }
  const r = await ctx.midas.deduct(order, session);
  if (r.kind === "ok") {
    await ctx.db.transition(order.billNo, "PAYING", "PAID");
    return true;
  }
  if (r.kind === "rejected") {
    await ctx.db.transition(order.billNo, "PAYING", "FAILED", r.reason);
    return true;
  }
  await ctx.db.recordAttempt(order.billNo, describe(r));
  return false;
}

/**
 * PAID → DELIVERED, or REFUNDING if the item can never be given.
 *
 * Exported because the delivery-notice handler and the recovery job reach
 * the same step. Temporary database errors are thrown: the order stays
 * PAID and a later try delivers it. Only "impossible" leads to a refund,
 * otherwise a player could get both the item and their money back.
 */
export async function deliver(db: Db, order: Order, source: GrantSource): Promise<void> {
  const outcome = await db.deliver(order, source);
  if (outcome === "impossible") {
    await db.transition(order.billNo, "PAID", "REFUNDING", "item cannot be delivered");
  }
}

/** REFUNDING → REFUNDED. Returns false if the order must stay REFUNDING. */
async function refund(ctx: Ctx, order: Order, session: UserSession): Promise<boolean> {
  const r = await ctx.midas.cancelDeduct(order, session);
  if (r.kind === "ok") {
    await ctx.db.transition(order.billNo, "REFUNDING", "REFUNDED");
    return true;
  }
  // A rejected refund needs a human: coins taken, no item, refund refused.
  await ctx.db.recordAttempt(order.billNo, `refund: ${describe(r)}`);
  return false;
}

const describe = (r: CallResult) =>
  r.kind === "rejected" || r.kind === "unknown" ? `${r.kind}: ${r.reason}` : r.kind;

// Unique, under 63 chars, only letters, digits and "-", as Midas requires.
// The timestamp first makes orders easy to place in time when debugging.
const newBillNo = () => `${Date.now()}-${randomUUID()}`;

// Midas's idempotency window is 48 h; stop retrying well before it ends.
const SAFE_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_TRIES = 3;
const RETRY_DELAY_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
