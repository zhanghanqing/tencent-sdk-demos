-- Three tables are all the payment flow needs.
-- MySQL syntax; any database with transactions and unique keys works.

-- What can be bought, and for how much. The only source of prices.
CREATE TABLE products (
  item_id     VARCHAR(64)  PRIMARY KEY,
  mode        VARCHAR(8)   NOT NULL,     -- coins: paid with hosted game coins
                                         -- direct: bought with real money
  price       INT          NOT NULL,     -- coins, or 0.1 CNY units for direct
  on_sale     BOOLEAN      NOT NULL,     -- false blocks new orders only
  updated_at  DATETIME     NOT NULL
);

-- One row per order. Its status says exactly where the order stopped,
-- so any process can pick it up after a crash.
CREATE TABLE purchase_orders (
  bill_no     VARCHAR(63)  PRIMARY KEY,  -- our order id, also sent to Midas
  openid      VARCHAR(64)  NOT NULL,     -- player, from the verified login
  zone_id     VARCHAR(64)  NOT NULL,     -- "zone_role", as Midas expects
  platform    VARCHAR(16)  NOT NULL,     -- ios / android / pc
  pf          VARCHAR(128) NOT NULL,     -- from login; retries must reuse it
  mode        VARCHAR(8)   NOT NULL,     -- copied from products
  request_id  VARCHAR(64)  NOT NULL,     -- client makes one per tap
  item_id     VARCHAR(64)  NOT NULL,
  quantity    INT          NOT NULL,
  amount      INT          NOT NULL,     -- price snapshot, set by the server
  status      VARCHAR(16)  NOT NULL,     -- PAYING / PAID / DELIVERED /
                                         -- FAILED / REFUNDING / REFUNDED
  attempts    INT          NOT NULL DEFAULT 0,
  last_error  VARCHAR(255),
  created_at  DATETIME     NOT NULL,     -- deductions are retried only for
                                         -- 24 h (Midas's window is 48 h)
  updated_at  DATETIME     NOT NULL,
  UNIQUE KEY uq_tap (openid, request_id), -- a double tap cannot make two orders
  KEY idx_stuck (status, updated_at),     -- for the recovery job
  KEY idx_player (openid, status)         -- for resuming orders on login
);

-- One row per delivered order, whatever path delivered it.
-- The primary key is the guarantee that an order is delivered only once.
CREATE TABLE item_grants (
  bill_no     VARCHAR(63)  PRIMARY KEY,
  openid      VARCHAR(64)  NOT NULL,
  item_id     VARCHAR(64)  NOT NULL,
  quantity    INT          NOT NULL,
  source      VARCHAR(16)  NOT NULL,     -- coins / direct / recovery
  granted_at  DATETIME     NOT NULL
);
