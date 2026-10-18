import type {
  AccessTokenResponse, AuthTicketBody, AuthTicketResponse,
  GameOwnershipResponse, OwnershipWithBan, RailId,
} from "./types";

/**
 * Thin wrapper around the WeGame Web API, one method per endpoint.
 * It does HTTP and nothing else: no retries, no caching, no decisions.
 * Those live in AccessTokenProvider and LoginService.
 *
 * Hosts:
 *   login.wegame.com.cn   issues our access_token
 *   api.rail.tgp.qq.com   everything else; header "Authorization: bearer <token>"
 *
 * Every method here must only be called from our servers. The docs say so
 * for each endpoint ("必须由开发商的可信服务器调用").
 *
 * Not implemented in this demo.
 */
export interface WeGameWebApi {
  /**
   * POST https://login.wegame.com.cn/web/oauth2.0/token
   * form: grant_type=client_credentials, game_id, client_id, client_secret
   *
   * WARNING: calling this makes the previous token stop working within
   * 5 minutes. Only AccessTokenProvider may call it. See README
   * "One refresher for the whole fleet".
   */
  requestAccessToken(): Promise<AccessTokenResponse>;

  /**
   * POST /web/session_keeper/session_ticket/auth_ticket?rail_game_id=...
   *
   * Checks that `rail_session_ticket` is a live ticket of `rail_id` for our
   * game. A ticket can be checked only once; the session it starts ends
   * when the player cancels the ticket or goes offline.
   */
  authTicket(accessToken: string, body: AuthTicketBody): Promise<{ http: number; body: AuthTicketResponse }>;

  /**
   * GET /web/appstore/ownership/query_game_ownership?rail_id=...&rail_game_id=...
   * The player's ownership of our game and its DLCs.
   */
  queryGameOwnership(accessToken: string, railId: RailId): Promise<{ http: number; body: GameOwnershipResponse }>;

  /**
   * POST /web/appstore/ownership/query_publisher_games_ownership
   * Ownership AND ban status, for up to 50 games of the same publisher.
   */
  queryOwnershipAndBan(
    accessToken: string,
    railId: RailId,
    gameIds: string[],
  ): Promise<{ http: number; body: { result: { error_code: number; error_message: string }; ownership_list?: OwnershipWithBan[] } }>;

  /**
   * GET /web/session_keeper/session_ticket/hello?rail_game_id=...&rail_id=...
   * Returns {"result":0} when the session ticket service is up.
   * Used by our health check, and to test that a new token works.
   */
  hello(accessToken: string, railId: RailId): Promise<{ http: number; body: { result: number } }>;
}
