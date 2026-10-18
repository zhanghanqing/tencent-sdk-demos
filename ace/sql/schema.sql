-- Tables the moderation gate needs. MySQL syntax.

-- One row per checked item (chat line, name, voice piece).
-- The record we show a player who appeals, and the input for tuning.
CREATE TABLE moderation_log (
  id           BIGINT       PRIMARY KEY AUTO_INCREMENT,
  item_id      VARCHAR(64)  NOT NULL,      -- our message id = DataId sent to the service
  scene        VARCHAR(16)  NOT NULL,
  player_id    BIGINT       NOT NULL,
  content      TEXT         NULL,          -- text, or NULL for voice
  label        VARCHAR(16)  NOT NULL,
  sub_label    VARCHAR(32)  NULL,
  suggestion   VARCHAR(8)   NOT NULL,      -- Pass / Review / Block
  score        TINYINT      NOT NULL,
  keywords     JSON         NULL,
  source       VARCHAR(16)  NOT NULL,      -- service / local_blocklist / cache
  decision     VARCHAR(16)  NOT NULL,      -- deliver / deliver_masked / sender_only / reject / hold
  request_id   VARCHAR(64)  NULL,          -- the service's RequestId
  needs_recheck BOOLEAN     NOT NULL DEFAULT FALSE, -- went out on the blocklist alone
  created_at   DATETIME     NOT NULL,
  UNIQUE KEY uq_item (item_id),
  KEY idx_player_time (player_id, created_at),
  KEY idx_recheck (needs_recheck, created_at)
);

-- Voice callbacks may arrive more than once. One row per violating piece.
CREATE TABLE voice_results (
  piece_key    VARCHAR(96)  PRIMARY KEY,   -- TaskId + ':' + PieceStartTime
  task_id      VARCHAR(64)  NOT NULL,
  player_id    BIGINT       NULL,          -- NULL if the OpenId is unknown to us
  room_id      VARCHAR(64)  NULL,
  label        VARCHAR(16)  NOT NULL,
  keywords     JSON         NULL,
  evidence_url VARCHAR(512) NULL,          -- DumpUrl: the audio kept as evidence
  created_at   DATETIME     NOT NULL
);

-- Confirmed violations. Penalty points are summed from here.
CREATE TABLE violations (
  id           BIGINT       PRIMARY KEY AUTO_INCREMENT,
  player_id    BIGINT       NOT NULL,
  scene        VARCHAR(16)  NOT NULL,
  label        VARCHAR(16)  NOT NULL,
  severity     TINYINT      NOT NULL,      -- from LABEL_SEVERITY at the time
  evidence     VARCHAR(512) NOT NULL,      -- moderation_log item or voice piece
  voided       BOOLEAN      NOT NULL DEFAULT FALSE, -- cleared on a won appeal
  created_at   DATETIME     NOT NULL,
  KEY idx_player_time (player_id, created_at)
);

-- Punishments, current and past.
CREATE TABLE penalties (
  id           BIGINT       PRIMARY KEY AUTO_INCREMENT,
  player_id    BIGINT       NOT NULL,
  kind         VARCHAR(16)  NOT NULL,      -- warn / mute / chat_ban / account_review
  starts_at    DATETIME     NOT NULL,
  ends_at      DATETIME     NULL,          -- NULL = until lifted
  reason       VARCHAR(255) NOT NULL,
  lifted_at    DATETIME     NULL,
  lifted_by    VARCHAR(64)  NULL,
  KEY idx_active (player_id, ends_at)
);

-- Items waiting for a human: held names, Review verdicts, appeals.
CREATE TABLE review_queue (
  id           BIGINT       PRIMARY KEY AUTO_INCREMENT,
  kind         VARCHAR(16)  NOT NULL,      -- name / review / appeal
  item_id      VARCHAR(96)  NOT NULL,
  player_id    BIGINT       NOT NULL,
  status       VARCHAR(16)  NOT NULL,      -- pending / approved / rejected
  reviewer     VARCHAR(64)  NULL,
  created_at   DATETIME     NOT NULL,
  decided_at   DATETIME     NULL,
  UNIQUE KEY uq_item (kind, item_id),
  KEY idx_pending (status, created_at)
);

-- Our own words: the local blocklist, editable without a deploy.
CREATE TABLE moderation_terms (
  term         VARCHAR(64)  PRIMARY KEY,   -- stored normalized
  label        VARCHAR(16)  NOT NULL,
  added_by     VARCHAR(64)  NOT NULL,
  created_at   DATETIME     NOT NULL
);
