/** What each call of the forge client answers: the forge's document or answer, or a verdict on why there is none. */

/**
 * `unreachable`: no answer in time. `unauthorized`: the token was refused (401). `refused`: any other answer than success, with the
 * forge's code and sentence passed on unchanged where its body holds them. `malformed`: a success whose body cannot be read.
 */
export type ForgeClientFailure =
  | { readonly verdict: 'unreachable' }
  | { readonly verdict: 'unauthorized' }
  | { readonly verdict: 'refused'; readonly refusal: string | null; readonly text: string | null }
  | { readonly verdict: 'malformed' };

/** The parsed JSON of a read route, unchecked: an ingestion validates it and checks its version. */
export type ForgeDocumentAnswer = { readonly verdict: 'answered'; readonly document: unknown } | ForgeClientFailure;

export type ForgeCommandOutcome = 'done' | 'nothing-to-do';

export type ForgeCommandAnswer = { readonly verdict: 'answered'; readonly outcome: ForgeCommandOutcome } | ForgeClientFailure;

/**
 * How following a monitor stream ended. `closed`: the forge ended the stream, as at a Baton pass. `broken`: the connection broke.
 * `stopped`: the caller stopped following. A failure: the stream never opened.
 */
export type MonitorFollowEnd = { readonly verdict: 'ended'; readonly ending: 'closed' | 'broken' | 'stopped' } | ForgeClientFailure;

/**
 * One whole event of a forge's stream: the last event id the stream has sent so far, as event streams carry it (`null` until one is sent,
 * as for the handshake), its name and its data text.
 */
export interface ForgeStreamEvent {
  readonly id:        string | null;
  readonly eventName: string;
  readonly data:      string;
}

/** Following one of a forge's event streams; its end reads as a monitor follow's does. */
export interface ForgeStreamFollow {
  /** Rejects only with what the caller's event handler threw, and closes the stream all the same. */
  readonly ended: Promise<MonitorFollowEnd>;
  /** Stops following and closes the stream; `ended` then answers `stopped`. */
  readonly stop:  () => void;
}

/**
 * A board command's or a picture upload's answer as the forge gave it: its status (200 applied, 423 held for an install change, any other a
 * refusal) and its parsed body, unchecked, for an ingestion to read. `malformed`: a body that is no JSON.
 */
export type ForgeBoardCommandAnswer =
  | { readonly verdict: 'answered'; readonly status: number; readonly body: unknown }
  | ForgeClientFailure;

export type ForgePictureUploadAnswer = ForgeBoardCommandAnswer;

/** A picture as the forge served it: the bytes and their content type, or the forge's refusal's status with its body's bytes. */
export type ForgePictureAnswer =
  | { readonly verdict: 'answered'; readonly status: number; readonly contentType: string | null; readonly bytes: Uint8Array }
  | ForgeClientFailure;

export interface MonitorFollow {
  /** Rejects only with what the caller's snapshot handler threw, and closes the stream all the same. */
  readonly ended: Promise<MonitorFollowEnd>;
  /** Stops following and closes the stream; `ended` then answers `stopped`. */
  readonly stop:  () => void;
}

/** Where one Hephaestus's open routes are reached. */
export interface HephaestusAddress {
  readonly hephaestusUrl: string;
}

/** What a call needs to reach one Hephaestus's guarded routes; the token travels as a bearer and nowhere else. */
export interface HephaestusAccess extends HephaestusAddress {
  readonly bearerToken: string;
}
