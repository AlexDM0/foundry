/**
 * What a document version names in the main line's tree, as an effect reading reports it, and the port that runs readings and keeps the
 * newest one of each ticket document in memory. Nothing of it is stored on the board: a restart forgets every reading.
 */
import type { LineRange, TicketDocumentKind } from '../../domain/tracker-model/@types/TicketDocument.ts';

export type EffectChange = 'adds' | 'changes' | 'removes' | 'unresolved';

export type EffectReadingState = 'reading' | 'read' | 'failed';

/** `no-match`: a changed or removed path the tree does not hold; `ambiguous`: more than one candidate path. */
export type EffectUnresolvedReason = 'ambiguous' | 'no-match';

/** A sentence of the document the reading resolved, numbered as its marks read. */
export interface EffectReference {
  reference: number;
  lines:     LineRange;
  quote:     string;
}

export interface EffectEntry {
  reference:        number;
  path:             string;
  change:           EffectChange;
  detail:           string;
  /** `null` unless `change` is `unresolved`. */
  unresolvedReason: EffectUnresolvedReason | null;
  candidates:       string[];
}

export interface EffectReading {
  ticketId:             string;
  document:             TicketDocumentKind;
  versionNumber:        number;
  state:                EffectReadingState;
  /** `null` while the reading runs. */
  durationMilliseconds: number | null;
  references:           EffectReference[];
  entries:              EffectEntry[];
}

export interface EffectReadingRequest {
  ticketId:         string;
  document:         TicketDocumentKind;
  versionNumber:    number;
  /** The document agent asked: its summary then goes to the agent as a `board` message. */
  requestedByAgent: boolean;
}

/** Runs one reading at a time per board, outside the agent slots, and keeps the newest reading of each ticket document. */
export interface EffectReadingSource {
  readingsOf: (ticketId: string) => readonly EffectReading[];
  request:    (request: EffectReadingRequest) => void;
  /** Calls the listener with the ticket whose reading changed; the answer stops listening. */
  onChanged:  (listener: (ticketId: string) => void) => () => void;
}
