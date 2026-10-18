import type { DenyReason } from "./types";

/**
 * What to do with each auth_ticket result code.
 * Codes and meanings are from the public "校验会话票据" page.
 *
 * Why a table and not if/else: the decision for every code is visible in
 * one place and can be reviewed without reading the login logic.
 *
 * The rule behind it: anything that says "this ticket or player is not
 * acceptable" denies. Anything that says "WeGame could not answer right
 * now" means retry. Nothing ever lets a player in without result 0.
 */
export type TicketOutcome =
  | { action: "accept" }
  | { action: "deny"; reason: DenyReason }
  | { action: "retry" }
  | { action: "bug" };   // our request was wrong: alert, deny for now

export const AUTH_TICKET_OUTCOMES: Record<number, TicketOutcome> = {
  0:       { action: "accept" },

  // The ticket itself is not acceptable.
  11501:   { action: "deny", reason: "bad_ticket" },   // invalid ticket
  11502:   { action: "deny", reason: "bad_ticket" },   // ticket belongs to someone else
  11503:   { action: "deny", reason: "bad_ticket" },   // ticket was cancelled
  11504:   { action: "deny", reason: "bad_ticket" },   // ticket expired
  2150001: { action: "deny", reason: "bad_ticket" },   // ticket content invalid
  2150006: { action: "deny", reason: "bad_ticket" },   // ticket not valid base64
  2150047: { action: "deny", reason: "bad_ticket" },   // ticket not valid JSON
  2150048: { action: "deny", reason: "bad_ticket" },   // ticket missing fields

  // The player is not acceptable.
  11506:   { action: "deny", reason: "not_owned" },    // no relation to this game
  11511:   { action: "deny", reason: "not_owned" },    // no permission
  11520:   { action: "deny", reason: "banned" },       // ticket owner is banned
  2150059: { action: "deny", reason: "unsafe_env" },   // abnormal login environment

  // WeGame could not answer. Try again; never let the player in meanwhile.
  11505:   { action: "retry" },                        // game lookup failed
  11508:   { action: "retry" },                        // internal error
  11509:   { action: "retry" },                        // rate limited

  // Our request was malformed. A code bug, not a player problem.
  11500:   { action: "bug" },                          // bad parameters
  11507:   { action: "bug" },                          // body MD5 check failed
  2150007: { action: "bug" },                          // base64 encoding failed
};

/**
 * Codes not in the table, and the documented 11510 ("has permission") and
 * 11512 ("temporary permission only"), are not treated as success.
 *
 * Why: the docs do not say when auth_ticket returns them instead of 0.
 * Treating an unknown code as success would let players in on a code we do
 * not understand. Treating it as a bug raises an alert so a human decides.
 */
export const UNKNOWN_CODE_OUTCOME: TicketOutcome = { action: "bug" };

/**
 * HTTP status codes from any Web API call, per the "Web API HTTP 状态码"
 * section. 200 means "auth passed; read the body". 403 means our
 * access_token is bad: refresh it once and repeat the call.
 */
export const HTTP_OUTCOMES: Record<number, "read_body" | "refresh_token" | "retry" | "bug"> = {
  200: "read_body",
  400: "bug",
  403: "refresh_token",
  404: "bug",
  500: "retry",
  502: "retry",
  503: "retry",                // rate limited
};
