/**
 * How Gaia's relay of a forge's board ended one request, as Gaia holds it between the forge's answer and the page's: the forge's own answer,
 * or a refusal of Gaia's. Internal only, so it carries no version; only the page contract's mapper turns it into an answer.
 */
import type { BoardCommandAnswer } from './BoardCommandAnswer.ts';
import type { BoardRefusal }       from './BoardRefusal.ts';

/**
 * `forge-unreachable`: no Overseer of the forge answers. `forge-version-unsupported`: its system version is one Gaia cannot talk to.
 * `forge-document-unreadable`: the forge answered what Gaia cannot read. `too-large`: a body over the route's bound. `malformed-body` and
 * `unknown-kind`: a page's command Gaia cannot read.
 */
export type BoardRelayRefusal =
  | 'forge-not-registered'
  | 'forge-unreachable'
  | 'forge-version-unsupported'
  | 'forge-document-unreadable'
  | 'token-unreadable'
  | 'token-rejected'
  | 'not-found'
  | 'too-large'
  | 'malformed-body'
  | 'unknown-kind';

/** A picture as the forge stored it: the sha256 of its bytes as its id, its size and the media type its first bytes name. */
export interface BoardStoredPicture {
  readonly pictureId: string;
  readonly bytes:     number;
  readonly mediaType: string;
}

/** A forge's answer to a picture upload; `unreadable` names the keys of a body that is no answer the forge describes. */
export type BoardPictureUploadAnswer =
  | { readonly outcome: 'uploaded'; readonly picture: BoardStoredPicture }
  | { readonly outcome: 'refused'; readonly status: number; readonly refusal: BoardRefusal }
  | { readonly outcome: 'unreadable'; readonly status: number; readonly invalidKeys: readonly string[] };

/**
 * A board command relayed: the forge's answer, or Gaia's refusal with what is known of the command. `unreachable`: it never reached the
 * forge. `outcome-unknown`: it was sent and no answer Gaia can read came back, so the forge may have applied it.
 */
export type BoardCommandRelayVerdict =
  | { readonly verdict: 'answered'; readonly answer: BoardCommandAnswer }
  | { readonly verdict: 'refused-by-gaia'; readonly outcome: 'refused' | 'unreachable' | 'outcome-unknown'; readonly refusal: BoardRelayRefusal };

export type PictureUploadRelayVerdict =
  | { readonly verdict: 'answered'; readonly answer: BoardPictureUploadAnswer }
  | { readonly verdict: 'refused-by-gaia'; readonly refusal: BoardRelayRefusal };
