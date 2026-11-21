/**
 * What Gaia's relay of a forge's conversation streams sends the page: a job's transcript entries, each vendor-neutral, as the `history`
 * after a cursor and each `message`, and a gate profile run's output lines.
 */
import type { PAGE_CONTRACT_VERSIONS } from '../../../src/shared/constants/PageContractVersions.ts';

export type BoardTranscriptClientAct = 'chat' | 'answer' | 'interrupt' | 'close-input' | 'stop';

export type BoardTranscriptSender = 'user' | 'hephaestus' | 'assistant';

/** A picture a chat carried; `name` is `null` when no record of the job names it. The entry never carries the bytes. */
export interface BoardTranscriptPictureDocument {
  readonly pictureId: string;
  readonly name:      string | null;
  readonly mediaType: string;
  readonly bytes:     number;
}

/** One entry of a job's transcript; one cursor may give several entries, so an entry is known by its `entryKey`. */
export interface BoardTranscriptEntryDocument {
  readonly cursor:          string;
  readonly entryKey:        string;
  /** The forge's role name, shown by kind; a role this Gaia does not know is still an entry. */
  readonly role:            string;
  readonly text:            string;
  readonly at:              string | null;
  readonly toolName:        string | null;
  readonly parentToolUseId: string | null;
  readonly toolUseId:       string | null;
  readonly asksUser:        boolean;
  readonly model:           string | null;
  readonly tokens:          number | null;
  readonly clientAct:       BoardTranscriptClientAct | null;
  readonly sentBy:          BoardTranscriptSender | null;
  readonly chatSequence:    number | null;
  readonly incidentIds:     readonly string[];
  readonly pictures:        readonly BoardTranscriptPictureDocument[];
}

export interface BoardProfileLineDocument {
  readonly text: string;
}

/**
 * One event of a conversation stream Gaia relays: a job stream's `history`, every entry after the cursor asked for, and each `message`, and
 * a profile stream's `line`.
 */
export type ConversationDocument = { readonly boardVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaBoard } & (
  | { readonly kind: 'history'; readonly entries: readonly BoardTranscriptEntryDocument[] }
  | { readonly kind: 'message'; readonly entry: BoardTranscriptEntryDocument }
  | { readonly kind: 'line'; readonly line: BoardProfileLineDocument }
);
