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

export type ForgeSessionCodeAnswer = { readonly verdict: 'answered'; readonly code: string } | ForgeClientFailure;

/**
 * How following a monitor stream ended. `closed`: the forge ended the stream, as at a Baton pass. `broken`: the connection broke.
 * `stopped`: the caller stopped following. A failure: the stream never opened.
 */
export type MonitorFollowEnd = { readonly verdict: 'ended'; readonly ending: 'closed' | 'broken' | 'stopped' } | ForgeClientFailure;

export interface MonitorFollow {
  readonly ended: Promise<MonitorFollowEnd>;
  /** Stops following and closes the stream; `ended` then answers `stopped`. */
  readonly stop:  () => void;
}

/** What a call needs to reach one Overseer's guarded routes; the token travels as a bearer and nowhere else. */
export interface OverseerAccess {
  readonly overseerUrl: string;
  readonly bearerToken: string;
}
