/**
 * What Gaia's relay of a forge's board answers the page beside the board itself: a refusal of Gaia's own, a stream's handshake, a board
 * command's answer and a picture upload's answer. A forge's refusal reads as the forge's own sentence, unchanged (decision 45).
 */
import type { PAGE_CONTRACT_VERSIONS } from '../../../src/shared/constants/PageContractVersions.ts';

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

export interface BoardRelayRefusalDocument {
  readonly refusal:   BoardRelayRefusal;
  readonly refusedBy: 'gaia';
}

/** The first event of every relayed stream, `event: handshake`, written with no id so it never moves the replay cursor. */
export interface BoardStreamHandshakeDocument {
  readonly boardStreamVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaBoardStream;
  /** Gaia's. */
  readonly systemVersion:      { readonly major: number; readonly minor: number };
  readonly forgeSystemVersion: { readonly major: number; readonly minor: number };
}

/** A forge's refusal: its reason code, the facts it names and the sentence its command line prints, in `text` unchanged. */
export interface BoardForgeRefusalDocument {
  readonly refusedBy: 'forge';
  readonly code:      string;
  readonly fields:    Readonly<Record<string, unknown>>;
  readonly text:      string;
}

/** A refusal as the page shows it: the forge's sentence unchanged, or Gaia's own for a refusal of Gaia's. */
export type BoardRefusalDocument =
  | BoardForgeRefusalDocument
  | { readonly refusedBy: 'gaia'; readonly code: BoardRelayRefusal; readonly text: string };

export type BoardCommandOutcome = 'applied' | 'refused' | 'install-held' | 'unreachable' | 'outcome-unknown';

export interface BoardCommandAnswerDocument {
  readonly boardCommandAnswerVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaBoardCommandAnswer;
  readonly outcome:                   BoardCommandOutcome;
  /**
   * The forge's outcome when applied, the job the command started, such as an intake's product owner, and the version a ticket document's
   * save left at the head.
   */
  readonly applied:                   {
    readonly outcome:              'done' | 'nothing-to-do';
    readonly startedJobId:         string | null;
    readonly writtenVersionNumber: number | null;
  } | null;
  readonly refusal: BoardRefusalDocument | null;
}

export interface PictureUploadAnswerDocument {
  readonly pictureUploadAnswerVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaPictureUploadAnswer;
  readonly outcome:                    'uploaded' | 'refused';
  readonly picture:                    { readonly pictureId: string; readonly bytes: number; readonly mediaType: string } | null;
  readonly refusal:                    BoardRefusalDocument | null;
}
