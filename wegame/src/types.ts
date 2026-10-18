/**
 * A player's WeGame id for one game. Assigned when the player activates the
 * game, unique within that game, and never changes.
 *
 * Why a string: it is a 64-bit unsigned integer (e.g. "76561197980265943").
 * JavaScript numbers are exact only up to 2^53, so parsing it as a number
 * would silently change it. The Web API also sends it as a string.
 */
export type RailId = string;

/** Our own id for a player. Never shown to WeGame. */
export type PlayerId = string;

// ---------------------------------------------------------------------------
// Token 1: the SERVER's credential for calling the WeGame Web API.
// ---------------------------------------------------------------------------

/**
 * Response of POST https://login.wegame.com.cn/web/oauth2.0/token
 * (grant_type = client_credentials).
 */
export interface AccessTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;          // seconds; 3600 today, but always read this
}

/** What we keep in the shared cache. */
export interface CachedAccessToken {
  token: string;
  expiresAt: number;           // ms since epoch, from expires_in
  refreshAt: number;           // ms since epoch, well before expiresAt
}

/** Error body from the token endpoint, or a 403 from any Web API call. */
export interface OAuthError {
  realm: string;
  error:
    | "invalid_request" | "unauthorized_client" | "access_denied"
    | "unsupported_response_type" | "invalid_scope" | "server_error"
    | "invalid_token" | "insufficient_scope";
  error_description: string;
}

// ---------------------------------------------------------------------------
// Token 2: the PLAYER's session ticket, proving who they are.
// ---------------------------------------------------------------------------

/** 1 = logging in, 2 = anything else (e.g. reconnecting after a drop). */
export type SceneType = 1 | 2;

/** What the game client sends to our login endpoint. */
export interface LoginRequest {
  railId: RailId;              // a claim; only trusted after auth_ticket
  sessionTicket: string;       // from the SDK's AsyncAcquireSessionTicket
  sceneType: SceneType;
}

/**
 * Body of POST /web/session_keeper/session_ticket/auth_ticket?rail_game_id=...
 * client_ip is taken from the connection, never from the request body.
 */
export interface AuthTicketBody {
  rail_id: RailId;
  rail_session_ticket: string;
  scene_type: SceneType;
  client_ip: string;
  meta_data?: string;
}

/** Response of auth_ticket. result 0 = valid. */
export interface AuthTicketResponse {
  result: number;
  error_msg?: string;
}

// ---------------------------------------------------------------------------
// Ownership and bans.
// ---------------------------------------------------------------------------

/** expire_time value that means "owned forever" (kRailOwnershipPermanent). */
export const OWNERSHIP_PERMANENT = 4294967295;

/** Response of GET /web/appstore/ownership/query_game_ownership. */
export interface GameOwnershipResponse {
  result: number;
  err_info: string;
  ownship?: {                  // sic: the API spells it this way
    game_id: string;
    railid: RailId;
    expire_time: number;       // unix seconds (UTC)
    purchase_time: number;
    user_dlc_list: { game_id: string; expire_time: number; purchase_time: number }[];
  };
}

/** One entry of POST /web/appstore/ownership/query_publisher_games_ownership. */
export interface OwnershipWithBan {
  rail_game_id: string;
  expire_time: number;
  purchase_time: number;
  player_banned_status: {
    status: number;            // EnumRailPlayerBanStatus, see README
    ban_end_time: number;
    cheat_description: { zh_CN?: string; en_US?: string; zh_HK?: string };
  };
}

// ---------------------------------------------------------------------------
// Token 3: OUR session, issued after WeGame said yes.
// ---------------------------------------------------------------------------

/** Returned to the client after a successful login. */
export interface GameSession {
  token: string;               // random, opaque; only its hash is stored
  playerId: PlayerId;
  expiresAt: number;
}

/** Everything our login can answer. */
export type LoginResult =
  | { kind: "ok"; session: GameSession }
  | { kind: "denied"; reason: DenyReason }   // final: show a message
  | { kind: "retry"; afterMs: number };      // WeGame busy: try again soon

export type DenyReason =
  | "bad_ticket"       // invalid, expired, cancelled, or not this player's
  | "not_owned"        // player does not own the game
  | "banned"           // player is banned
  | "unsafe_env";      // WeGame says the login environment is abnormal
