/** Our own player id. */
export type PlayerId = string;

/**
 * Where a piece of content will be seen. The scene decides how strict we
 * are and what happens when the moderation service is slow or down.
 */
export type Scene =
  | "nickname"      // public, permanent, seen by everyone
  | "clan_name"     // public, permanent
  | "world_chat"    // public, short-lived
  | "team_chat"     // a few players, short-lived
  | "whisper"       // one other player
  | "voice_live"    // real-time voice in a room (checked after the fact)
  | "voice_message"; // recorded voice clip

/**
 * One moderation label, normalized. The two services spell labels
 * differently (text: "Abuse"; voice: "abuse"), so both map onto this.
 * Public docs list Normal, Porn, Abuse, Ad for text, and normal, politics,
 * porn, abuse, ad, illegal, terrorism, moan, customized for voice.
 */
export type Label =
  | "normal" | "ad" | "abuse" | "porn" | "moan"
  | "illegal" | "terrorism" | "politics" | "custom" | "other";

/** The service's advice. Text moderation returns it directly. */
export type Suggestion = "Pass" | "Review" | "Block";

/**
 * What we learned about one piece of content, whichever service checked it.
 * Everything the rest of the system needs, nothing service-specific.
 */
export interface Verdict {
  label: Label;
  subLabel?: string;
  suggestion: Suggestion;
  score: number;              // 0-100, the service's confidence
  keywords: string[];         // words that matched; used for masking
  requestId: string;          // the service's id, kept for appeals
  source: "service" | "local_blocklist" | "cache";
}

/**
 * What we do with a message or name. Decided by policy.ts, never by the
 * client.
 */
export type Decision =
  | { kind: "deliver" }                       // show as written
  | { kind: "deliver_masked"; text: string }  // show with keywords as ***
  | { kind: "sender_only" }                   // only the sender sees it
  | { kind: "reject"; reason: string }        // tell the sender it was refused
  | { kind: "hold" };                         // wait for a human (names)

/** A chat line or name sent to our server for checking. */
export interface TextItem {
  id: string;                 // our message id; sent as DataId for tracing
  scene: Scene;
  playerId: PlayerId;
  text: string;
}

/** Punishments, from mildest to strongest. */
export type PenaltyKind = "warn" | "mute" | "chat_ban" | "account_review";

export interface Penalty {
  playerId: PlayerId;
  kind: PenaltyKind;
  startsAt: number;           // ms since epoch
  endsAt: number | null;      // null = until a human lifts it
  reason: string;
}

/**
 * Body of a GME voice moderation callback (real-time voice, third-party
 * streams, and audio files share it). Field names from the public
 * "回调说明" page; only the fields we use are listed.
 */
export interface VoiceCallback {
  TaskId: string;
  DataId: string;
  Status: string;             // e.g. "Success"
  HitFlag: boolean;           // true = something violated
  Live: boolean;
  ScanPiece: {
    RoomId?: string;
    OpenId?: string;          // the speaker, as our game reported them to GME
    HitFlag: boolean;
    MainType: string;         // the main label of this piece
    Offset: number;
    Duration: number;
    PieceStartTime: number;
    DumpUrl?: string;         // where the evidence audio is kept
    ScanDetail: { Label: string; KeyWord: string; Rate: string; StartTime: number; EndTime: number }[];
  }[];
}
