import type { GameSession, LoginRequest, LoginResult, PlayerId, RailId } from "./types";

/**
 * The game server's login endpoint for WeGame players.
 *
 * Not implemented in this demo. The steps below are the contract; README
 * "Player login" draws them as a sequence diagram.
 *
 * login(req, clientIp):
 *   1. Rate-limit by clientIp and railId. Protects WeGame's quota (11509)
 *      and slows down ticket guessing.
 *   2. Call auth_ticket with req.railId, req.sessionTicket, req.sceneType
 *      and the IP we SEE on the connection (not one the client reports).
 *      Map the result with AUTH_TICKET_OUTCOMES (errors.ts):
 *        accept → go on; deny → return denied; retry → return retry;
 *        bug → alert, return retry.
 *      Only after result 0 is req.railId trusted.
 *   3. Check ownership and bans with queryOwnershipAndBan:
 *        expire_time in the past (and not OWNERSHIP_PERMANENT) → not_owned
 *        banned and ban_end_time in the future                → banned
 *   4. Find or create our account for railId (accounts table).
 *      Unique key on rail_id: two first logins at once make one account.
 *   5. Issue our own session (sessions table). Return it.
 *   6. Write one row to login_audit, whatever the outcome.
 *
 * Why we issue our own session instead of checking the ticket on every
 * request: a ticket can be checked only once, auth_ticket is rate-limited,
 * and our own session can be revoked by us (for example on a ban) at once.
 */
export interface LoginService {
  login(req: LoginRequest, clientIp: string): Promise<LoginResult>;

  /**
   * Check our own session token on every later request.
   * Looks up sha256(token) in sessions; rejects if missing, expired or
   * revoked. Never calls WeGame.
   */
  authenticate(token: string): Promise<PlayerId | null>;

  /**
   * End a session. The client should also call the SDK's
   * AbandonSessionTicket, so WeGame stops treating the ticket as live.
   */
  logout(token: string): Promise<void>;

  /**
   * Revoke every session of a player at once, for example when our
   * anti-cheat bans them. Their next request fails authenticate().
   */
  revokeAll(playerId: PlayerId): Promise<void>;
}

/**
 * Our database, for login. Tables in sql/schema.sql.
 * Not implemented in this demo. Each method lists its SQL.
 */
export interface AccountStore {
  /**
   * INSERT INTO accounts (player_id, rail_id, ...) VALUES (...)
   *   ON DUPLICATE KEY UPDATE last_login_at = NOW();
   * SELECT player_id FROM accounts WHERE rail_id = ?
   *
   * Why insert-or-update instead of "find, then create": two first logins
   * at the same moment would both find nothing and create two accounts.
   */
  upsertAccount(railId: RailId): Promise<PlayerId>;

  /**
   * INSERT INTO sessions (token_hash, player_id, rail_id, client_ip,
   *                       created_at, expires_at) VALUES (...)
   * Only the SHA-256 of the token is stored: a leaked table cannot be used
   * to log in.
   */
  createSession(session: GameSession, tokenHash: string, railId: RailId, clientIp: string): Promise<void>;

  /**
   * SELECT player_id FROM sessions
   *  WHERE token_hash = ? AND expires_at > NOW() AND revoked_at IS NULL
   */
  findSession(tokenHash: string): Promise<PlayerId | null>;

  /** UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ? */
  revokeSession(tokenHash: string): Promise<void>;

  /** UPDATE sessions SET revoked_at = NOW() WHERE player_id = ? AND revoked_at IS NULL */
  revokeAllSessions(playerId: PlayerId): Promise<void>;

  /**
   * INSERT INTO login_audit (rail_id, client_ip, scene_type, result_code,
   *                          outcome, created_at) VALUES (...)
   */
  audit(entry: {
    railId: RailId; clientIp: string; sceneType: number;
    resultCode: number | null; outcome: LoginResult["kind"] | "bug";
  }): Promise<void>;
}

/** How long our own session lasts before the client must log in again. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
