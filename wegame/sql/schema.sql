-- Tables our game server needs for WeGame login. MySQL syntax.
-- The WeGame access_token is NOT here: it lives in Redis (see README).

-- One row per player. Links WeGame's id to ours.
CREATE TABLE accounts (
  player_id      BIGINT       PRIMARY KEY AUTO_INCREMENT,
  rail_id        VARCHAR(20)  NOT NULL,   -- uint64 as text; never a float
  created_at     DATETIME     NOT NULL,
  last_login_at  DATETIME     NOT NULL,
  UNIQUE KEY uq_rail (rail_id)            -- two first logins → one account
);

-- Our own sessions, issued after WeGame accepted the ticket.
CREATE TABLE sessions (
  token_hash   CHAR(64)     PRIMARY KEY,  -- sha256 of the token, hex
  player_id    BIGINT       NOT NULL,
  rail_id      VARCHAR(20)  NOT NULL,
  client_ip    VARCHAR(45)  NOT NULL,     -- fits IPv6
  created_at   DATETIME     NOT NULL,
  expires_at   DATETIME     NOT NULL,
  revoked_at   DATETIME     NULL,         -- set on logout or ban
  KEY idx_player (player_id, revoked_at)  -- for "revoke all of a player"
);

-- Every login attempt, for investigating abuse and tuning rate limits.
CREATE TABLE login_audit (
  id           BIGINT       PRIMARY KEY AUTO_INCREMENT,
  rail_id      VARCHAR(20)  NOT NULL,     -- as claimed; may be false
  client_ip    VARCHAR(45)  NOT NULL,
  scene_type   TINYINT      NOT NULL,     -- 1 login, 2 reconnect
  result_code  INT          NULL,         -- auth_ticket result; NULL if not reached
  outcome      VARCHAR(8)   NOT NULL,     -- ok / denied / retry / bug
  created_at   DATETIME     NOT NULL,
  KEY idx_ip_time (client_ip, created_at),
  KEY idx_rail_time (rail_id, created_at)
);
