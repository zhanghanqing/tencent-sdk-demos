export type Platform = "ios" | "android" | "pc";

/**
 * coins:  the player spends game coins that Midas holds for them.
 *         Our server asks Midas to deduct.
 * direct: the player pays real money for the item itself.
 *         Midas tells our server when the payment is done.
 */
export type PayMode = "coins" | "direct";

/**
 * Where an order stopped. See README "Order state machine".
 * DELIVERED, FAILED and REFUNDED are final.
 */
export type OrderStatus =
  | "PAYING"     // saved; we do not yet know if money moved
  | "PAID"       // Midas confirmed the payment; item not given yet
  | "DELIVERED"  // item given
  | "FAILED"     // payment definitely did not happen
  | "REFUNDING"  // paid, but the item can never be given; money goes back
  | "REFUNDED";  // money returned

/** What the client may tell us. Note: there is no price. */
export interface PurchaseRequest {
  openid: string;      // from the verified login, never typed by the client
  zoneId: string;
  platform: Platform;
  pf: string;          // platform/channel info from login
  requestId: string;   // random id the client makes per tap
  itemId: string;
  quantity: number;
}

export interface Product {
  itemId: string;
  mode: PayMode;
  price: number;
  onSale: boolean;
}

/** One row of purchase_orders. */
export interface Order {
  billNo: string;
  openid: string;
  zoneId: string;
  platform: Platform;
  pf: string;
  mode: PayMode;
  requestId: string;
  itemId: string;
  quantity: number;
  amount: number;      // price snapshot, decided by the server
  status: OrderStatus;
  createdAt: number;   // ms since epoch; limits how long a deduction may be retried
}

/** Which path delivered an item. Stored in item_grants for auditing. */
export type GrantSource = "coins" | "direct" | "recovery";
