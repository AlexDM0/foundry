/** The board transaction a write hands its applier: the Board inside one exclusive hold, and what the store allocates for it without a path. */
import type { UnreadablePipelineReading }                             from '../../adapters/pipeline/PipelineFile.ts';
import type { LogRecord }                                             from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Ticket }                                                from '../../lib/tracker-model/@types/Ticket.ts';
import type { Board }                                                 from '../../lib/tracker-model/Board.ts';
import type { CreateTicketInput, RecordReference, UnreadableRecords } from './@types/BoardRecords.ts';
import type { Workspace }                                             from './Workspace.ts';

export interface BoardTransaction {
  board:                          Board;
  /** The board's place: the repository root for git and worktrees, the data folder for job folders and pictures. Never a record. */
  workspace:                      Workspace;
  at:                             string;
  records:                        RecordAllocation;
  unreadableRecords:              UnreadableRecords;
  /** The stored pipeline when the board cannot use it, older or malformed; `null` when it was read, or none is stored. */
  unreadablePipeline:             UnreadablePipelineReading | null;
  /** How many entries the log held when it was read, before anything this invocation logged. */
  storedLogEntryCount:            number;
  /** The log as it was read, before anything this invocation logged. */
  storedLogRecords:               readonly LogRecord[];
  /** `clear --all`: after the progress file and the changed tickets, the epic records too; the callback gets the ticket count. */
  deleteAllTicketFilesAfterwards: (onDeleted: (deletedTicketCount: number) => void) => void;
}

export interface RecordAllocation {
  /** A ticket with the next free id, stored by this transaction's commit; only safe inside it. */
  newTicket(input: CreateTicketInput): Ticket;
  /** The new epic's place; refuses `unreadable-file-in-the-way` (record `epic`) when an unreadable record holds the key. */
  newEpicLocation(epicKey: string): string;
  /** Refuses `unreadable-file-in-the-way` (record `draft`) when an unreadable record holds the key. */
  requireDraftKeyIsFree(draftId: string): void;
  locationOf(record: RecordReference): string;
}
