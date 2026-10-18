import type { GrantSource, Order, OrderStatus, Product } from "./types";

/**
 * Everything the payment flow needs from our own database.
 * Tables are in sql/schema.sql.
 *
 * Not implemented in this demo. Each method lists the SQL it stands for.
 */
export interface Db {
  /** SELECT * FROM products WHERE item_id = ? */
  getProduct(itemId: string): Promise<Product | null>;

  /**
   * INSERT INTO purchase_orders ...
   *
   * Returns false if (openid, request_id) already exists: the same tap
   * arrived twice. Why not check first and then insert: two identical
   * requests arriving together could both see "not found". The unique
   * key decides atomically.
   */
  insertOrder(order: Order): Promise<boolean>;

  /** SELECT * FROM purchase_orders WHERE openid = ? AND request_id = ? */
  findOrderByRequest(openid: string, requestId: string): Promise<Order | null>;

  /** SELECT * FROM purchase_orders WHERE bill_no = ? */
  getOrder(billNo: string): Promise<Order | null>;

  /**
   * UPDATE purchase_orders SET status = :to, last_error = :note
   *  WHERE bill_no = ? AND status = :from
   *
   * Returns false if the order was no longer in `from`.
   *
   * Why the old status is part of the condition: several processes may
   * work on the same order at once (the buyer's request, a Midas notice,
   * the recovery job). Only one of them can make each move.
   */
  transition(billNo: string, from: OrderStatus, to: OrderStatus, note?: string): Promise<boolean>;

  /**
   * UPDATE purchase_orders SET attempts = attempts + 1, last_error = ?
   *  WHERE bill_no = ?
   *
   * Orders with many attempts are raised to a human (see README).
   */
  recordAttempt(billNo: string, error: string): Promise<void>;

  /**
   * Give the item and close the order, in ONE transaction:
   *
   *   BEGIN;
   *   INSERT INTO item_grants (bill_no, ...) VALUES (?, ...);
   *   UPDATE player_inventory SET count = count + ? WHERE ...;
   *   UPDATE purchase_orders SET status = 'DELIVERED'
   *    WHERE bill_no = ? AND status = 'PAID';
   *   COMMIT;
   *
   * Returns:
   * - "delivered": done now.
   * - "duplicate": item_grants already had this bill_no, so the item was
   *   given before. The transaction is rolled back, and the order is set to
   *   DELIVERED if it was not already. Treated as success by callers.
   * - "impossible": the item can never be given (deleted from the game,
   *   or a one-per-player item the player already owns). Nothing changes.
   *
   * Throws on temporary errors (deadlock, timeout). The order stays PAID
   * and is delivered on a later try.
   *
   * Why one transaction: if the item were given but the order stayed PAID,
   * the next try would give it again.
   */
  deliver(order: Order, source: GrantSource): Promise<"delivered" | "duplicate" | "impossible">;

  /**
   * SELECT * FROM purchase_orders
   *  WHERE status = ? AND updated_at < NOW() - :olderThanMs
   */
  findStuck(status: OrderStatus, olderThanMs: number): Promise<Order[]>;

  /**
   * SELECT * FROM purchase_orders
   *  WHERE openid = ? AND status IN ('PAYING', 'REFUNDING')
   */
  findOpenOrders(openid: string): Promise<Order[]>;
}
