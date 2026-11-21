/**
 * The store port: the forge reaches its stored board only through it. Its command face applies one `ControlCommand`, its transaction face
 * holds the board for Hephaestus's pass, and both share a lock-free read side. `apply` and `transact` write nothing when they throw: a
 * `BoardRefusal` leaves as `OperationRefusal('refused', board-refusal)`, and a held or lost lock, an unreadable tracker or a malformed
 * hold journal as `unrepaired`.
 */
import type { PipelineReading }     from '../../adapters/pipeline/PipelineFile.ts';
import type { GateProfilesReading } from '../../lib/tracker-model/@types/GateProfile.ts';
import type { TrackerProgress }     from '../../lib/tracker-model/@types/TrackerProgress.ts';
import type { Board }               from '../../lib/tracker-model/Board.ts';
import type { ControlCommand }      from '../../shared/@types/ControlCommand.ts';
import type { ControlContext }      from '../../shared/@types/ControlContext.ts';
import type { ControlResultOf }     from '../control/ControlService.ts';
import type {
  BoardContents,
  LogRecordsReading,
  NewTracker,
  RecordReference,
  StoredBoardReading,
  TicketListing,
  TrackerCreation,
  UnfinishedWriteReading,
  UnreadableRecords
} from '../tracker/@types/BoardRecords.ts';
import type { BoardTransaction } from '../tracker/BoardTransaction.ts';

export interface BoardStore {
  readonly commands:     StoreCommandFace;
  readonly transactions: StoreTransactionFace;
  readonly reads:        StoreReadFace;
  /** Creates the board's records; an existing board is never replaced. */
  initialise(newTracker: NewTracker): Promise<TrackerCreation>;
}

export interface CommandRequest<Command extends ControlCommand> {
  command: Command;
  /** Already resolved by the caller; the Board stamps and logs with it. */
  at:      string;
  context: ControlContext;
}

export interface CommandWritten<Result> {
  /** `nothing-to-do` when the applier answered `changed: false`. */
  outcome:           'done' | 'nothing-to-do';
  result:            Result;
  /** The board as this write left it; only the caller holds it. */
  board:             Board;
  unreadableRecords: UnreadableRecords;
}

/** The face of the CLI and the command endpoint: one command, applied in one exclusive write, or refused writing nothing. */
export interface StoreCommandFace {
  apply<Command extends ControlCommand>(request: CommandRequest<Command>): Promise<CommandWritten<ControlResultOf<Command['kind']>>>;
}

export interface TransactionRequest<Result> {
  at:     string;
  mutate: (transaction: BoardTransaction) => Result | Promise<Result>;
}

export interface TransactionWritten<Result> {
  result:            Result;
  board:             Board;
  unreadableRecords: UnreadableRecords;
}

/**
 * Hephaestus's face: everything `mutate` changes is written together after it returns, or nothing when it throws. The write is
 * exclusive for as long as `mutate` runs, an `await` and a git call inside it included; a remote adapter cannot offer that.
 */
export interface StoreTransactionFace {
  transact<Result>(request: TransactionRequest<Result>): Promise<TransactionWritten<Result>>;
}

/** Lock-free reads, shared by both faces: a read may see a write that is half done, and never waits for one. */
export interface StoreReadFace {
  readBoard():           StoredBoardReading;
  /** Unrepaired `unreadable-tracker` when the board cannot be read. */
  requireBoard():        BoardContents;
  /** The progress record alone; the log is not read, so a broken log does not stop it. */
  requireProgress():     TrackerProgress;
  /** The stored pipeline as the store judges it: the reading every write opens the Board on. */
  readPipeline():        PipelineReading;
  /** The pipeline as stored, for display; `null` when none is stored or it cannot be read as text. */
  storedPipelineText():  string | null;
  readGateProfiles():    GateProfilesReading;
  readLogRecords():      LogRecordsReading;
  listTickets():         TicketListing;
  readUnfinishedWrite(): UnfinishedWriteReading;
  /**
   * The identity of the stored progress record, log and gate profile runs: equal strings mean none of the three changed. A change to a
   * ticket body, an epic or a draft alone does not change it.
   */
  revision():            string;
  /** Where a record is kept, for a report or a refusal to name; never for reading or writing it. */
  locationOf(record: RecordReference): string;
}
