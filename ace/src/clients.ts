import type { Verdict, VoiceCallback } from "./types";

/**
 * Text moderation, modeled on Tencent Cloud's public TextModeration API
 * (tms.tencentcloudapi.com, Action TextModeration, Version 2020-12-29).
 *
 * Not implemented in this demo. A real implementation signs requests with
 * our Tencent Cloud SecretId/SecretKey (server only), base64-encodes the
 * UTF-8 text into `Content`, and maps the response into a Verdict:
 *   Suggestion (Block / Review / Pass) → suggestion
 *   Label, SubLabel, Score             → label, subLabel, score
 *   Keywords, HitSnippetInfos          → keywords
 *   RequestId                          → requestId
 */
export interface TextModerationClient {
  /**
   * Check one text.
   * - `bizType`: which rule set to apply, configured in the console. One
   *   per scene lets names be stricter than chat.
   * - `dataId`: our message id (max 64 chars), so a verdict can be traced
   *   back to the exact message.
   * - `sessionId`: groups messages of one conversation so the service can
   *   judge by context ("you're dead" in a match vs. in a whisper).
   *
   * Limits from the docs: up to 10,000 characters; Chinese and English.
   * Throws on timeout, rate limit (RequestLimitExceeded,
   * InternalError.QueryReqLimited) or service error. Callers apply the
   * scene's onTimeout rule then.
   */
  check(text: string, opts: { bizType: string; dataId: string; sessionId?: string; timeoutMs: number }): Promise<Verdict>;
}

/**
 * Voice moderation, modeled on GME's public voice content security APIs
 * (gme.tencentcloudapi.com, Version 2018-07-11).
 *
 * Real-time voice in GME rooms is submitted by GME itself once the service
 * is enabled; results arrive as callbacks. Audio from elsewhere is
 * submitted with submitAudio.
 *
 * Not implemented in this demo.
 */
export interface VoiceModerationClient {
  /**
   * ScanVoice: submit up to 100 files or streams. Files up to 100 MB and
   * 30 minutes; streams up to 4 hours. Returns a TaskId per DataId.
   * Results come to our callback URL (or must be polled with
   * DescribeScanResultList if no callback is set).
   */
  submitAudio(tasks: { dataId: string; url: string }[], live: boolean, callbackUrl: string): Promise<{ dataId: string; taskId: string }[]>;

  /**
   * Check that a callback really came from GME.
   * Per the docs: Signature = Base64(HMAC-SHA1(raw POST body, SecretKey)),
   * passed as the `Signature` query parameter. Must run on the RAW body
   * bytes, before any JSON parsing, or the signature will not match.
   *
   * Why it matters: the callback URL is public. Without this check anyone
   * could post "player X said something terrible" and get them muted.
   */
  verifyCallback(rawBody: Buffer, signatureParam: string): boolean;

  /** Turn one callback into one Verdict per violating piece. */
  toVerdicts(cb: VoiceCallback): { openId?: string; roomId?: string; pieceKey: string; verdict: Verdict; evidenceUrl?: string }[];
}
