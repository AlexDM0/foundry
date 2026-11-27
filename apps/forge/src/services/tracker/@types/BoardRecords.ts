/** The store port's record vocabulary: what a board's stored records read as, importable without importing an adapter module. */
import type { UnreadableDraftProblem, UnreadableEpicProblem, UnreadableTicketDocumentsProblem } from '../../../adapters/@types/UnreadableRecordProblem.ts';
import type { StoredLog }                                                                       from '../../../adapters/log/@types/StoredLog.ts';
import type { PipelineReading }                                                                 from '../../../adapters/pipeline/PipelineFile.ts';
import type { Draft }                                                                           from '../../../domain/tracker-model/@types/Draft.ts';
import type { Epic }                                                                            from '../../../domain/tracker-model/@types/Epic.ts';
import type { GateProfilesReading }                                                             from '../../../domain/tracker-model/@types/GateProfile.ts';
import type { LogRecord }                                                                       from '../../../domain/tracker-model/@types/LogRecord.ts';
import type { ConstitutionSourcesReading, PipelineSetupReading }                                from '../../../domain/tracker-model/@types/PipelineSetup.ts';
import type { Ticket, TicketPriority, TicketType }                                              from '../../../domain/tracker-model/@types/Ticket.ts';
import type { LoadedTicketDocumentRecord }                                                      from '../../../domain/tracker-model/@types/TicketDocument.ts';
import type { TrackerProgress }                                                                 from '../../../domain/tracker-model/@types/TrackerProgress.ts';
import type { HoldJournalProblem }                                                              from '../../../shared/@types/HoldJournalProblem.ts';
import type { LogFileProblem }                                                                  from '../../../shared/@types/LogFileProblem.ts';
import type { UnreadableTicketProblem }                                                         from '../../../shared/@types/UnreadableTicketProblem.ts';
import type { UnreadableTracker }                                                               from '../../../shared/@types/UnreadableTracker.ts';

export type RecordKind = 'ticket' | 'epic' | 'draft' | 'ticket-documents';

/** Where a record the store cannot read is kept. */
export interface UnreadableRecordPlace {
  /** The ticket id, epic key or draft id the record's storage names; `null` when it names none. */
  key:      string | null;
  /** Where it is kept, for the report a repair needs; the local adapter's file path. */
  location: string;
  /** The line the problem points at; 0 where there is none. */
  line:     number;
}

/** A record the store holds and cannot read, with what is wrong with it; it is no part of the Board. */
export type UnreadableRecord = UnreadableRecordPlace & (
  | { record: 'ticket'; problem: UnreadableTicketProblem }
  | { record: 'epic'; problem: UnreadableEpicProblem }
  | { record: 'draft'; problem: UnreadableDraftProblem }
  | { record: 'ticket-documents'; problem: UnreadableTicketDocumentsProblem }
);

export type UnreadableTicketRecord = Extract<UnreadableRecord, { record: 'ticket' }>;
export type UnreadableEpicRecord = Extract<UnreadableRecord, { record: 'epic' }>;
export type UnreadableDraftRecord = Extract<UnreadableRecord, { record: 'draft' }>;
export type UnreadableTicketDocumentsRecord = Extract<UnreadableRecord, { record: 'ticket-documents' }>;

export interface UnreadableRecords {
  tickets:         readonly UnreadableTicketRecord[];
  epics:           readonly UnreadableEpicRecord[];
  drafts:          readonly UnreadableDraftRecord[];
  ticketDocuments: readonly UnreadableTicketDocumentsRecord[];
}

/** The records a board holds one of; a ticket, an epic or a draft is never named by where it is kept. */
export type RecordReference = {
  record: 'progress' | 'pipeline' | 'pipeline-setup' | 'gate-profiles' | 'constitution-sources' | 'log' | 'unfinished-write';
};

export interface TicketListing {
  tickets:         Ticket[];
  unreadable:      UnreadableTicketRecord[];
  /** Tickets whose stored text no longer matches their content hash; read with the kept content. */
  contentRestored: readonly string[];
}

export interface BoardContents {
  progress:                   TrackerProgress;
  /** A malformed pipeline leaves the rest readable: the board reads it as no pipeline, and the `gate` verbs refuse to write over it. */
  pipelineReading:            PipelineReading;
  /** A malformed record leaves the rest readable: every setup move refuses rather than write over it. */
  pipelineSetupReading:       PipelineSetupReading;
  /** A malformed file leaves the rest readable: every profile move refuses rather than write over it. */
  gateProfilesReading:        GateProfilesReading;
  /** A malformed file shows no source tags, and only an Apply writes over it. */
  constitutionSourcesReading: ConstitutionSourcesReading;
  storedLog:                  StoredLog;
  listing:                    TicketListing;
  epicListing:                { epics: Epic[]; unreadable: UnreadableEpicRecord[] };
  draftListing:               { drafts: Draft[]; unreadable: UnreadableDraftRecord[] };
  /** Each ticket's documents record with the text of every version it names; one that cannot be read is an unreadable entry, keyed by ticket. */
  ticketDocumentListing:      { records: LoadedTicketDocumentRecord[]; unreadable: UnreadableTicketDocumentsRecord[] };
}

export type UnfinishedWriteReading =
  | { verdict: 'none' }
  | { verdict: 'pending' }
  | { verdict: 'malformed'; location: string; problem: HoldJournalProblem };

export type StoredBoardReading =
  | { verdict: 'readable'; contents: BoardContents; unfinishedWrite: UnfinishedWriteReading }
  | UnreadableTracker;

export type LogRecordsReading =
  | { verdict: 'readable'; records: readonly LogRecord[] }
  | { verdict: 'unreadable'; problem: LogFileProblem };

export interface NewTracker {
  project:          string;
  startedAt:        string;
  /** The page's localStorage namespace; the caller supplies it, so the store has no randomness to fake in a spec. */
  trackerId:        string;
  /** Absent for a tracker whose branches keep their bare names. */
  branchNamespace?: string;
}

export type TrackerCreation = { verdict: 'created' } | { verdict: 'already-exists' };

export interface CreateTicketInput {
  title:     string;
  type:      TicketType;
  /** Written only when given, so a ticket filed without one reads as normal exactly like a ticket filed before priorities existed. */
  priority?: TicketPriority;
  group?:    string;
  /** Given the id the store assigns, so a body that names its own ticket cannot name another. */
  bodyFor:   (ticketId: string) => string;
  /** The timestamp the ticket records as both `filed` and `updated`; the caller owns the clock. */
  at:        string;
}
