/**
 * The store port over today's tracker files: every write is one `writeTracker` hold, every read goes without the lock, and the stored
 * pipeline is judged once, in the reading a write opens the Board on.
 */
import { createHash }   from 'node:crypto';
import { readFileSync } from 'node:fs';

import { storedFileTextOf }                     from '../../adapters/StoredFileText.ts';
import { LogFileIngestion }                     from '../../adapters/log/LogFileIngestion.ts';
import { LogRecordMappingUtil }                 from '../../adapters/log/utils/LogRecordMappingUtil.ts';
import { GateProfilesFile }                     from '../../adapters/pipeline/GateProfilesFile.ts';
import type { ControlCommand }                  from '../../shared/@types/ControlCommand.ts';
import { ControlService, type ControlResultOf } from '../control/ControlService.ts';
import type {
  LogRecordsReading,
  NewTracker,
  RecordReference,
  StoredBoardReading,
  UnfinishedWriteReading
} from '../tracker/@types/BoardRecords.ts';
import type { LockTaker }               from '../tracker/GenerationLock.ts';
import { readHoldJournal }              from '../tracker/HoldJournal.ts';
import { singleRecordFilePathOf }       from '../tracker/LocalRecordAllocation.ts';
import { localStoreLayoutOf }           from '../tracker/LocalStoreLayout.ts';
import { listTickets, ticketListingOf } from '../tracker/TicketStore.ts';
import { createTracker }                from '../tracker/TrackerCreation.ts';
import { writeTracker }                 from '../tracker/TrackerPipeline.ts';
import {
  readTracker,
  requireProgressFile,
  requireTracker,
  storedPipelineReadingOf
} from '../tracker/TrackerReader.ts';
import type { Workspace } from '../tracker/Workspace.ts';
import type {
  BoardStore,
  CommandRequest,
  CommandWritten,
  StoreReadFace,
  TransactionRequest,
  TransactionWritten
} from './BoardStore.ts';

export interface LocalFilesBoardStoreOptions {
  workspace:         Workspace;
  /** The caller's clock, for the lock's records only. */
  now:               () => Date;
  /** This process as the lock's taker, and how it judges a holder it finds. */
  lockTaker:         LockTaker;
  /** Called after each file a write stores; the step a spec interrupts to cut a write short. */
  afterFileWritten?: (location: string) => void;
}

function unfinishedWriteOf(workspace: Workspace): UnfinishedWriteReading {
  const journalReading = readHoldJournal(workspace);
  switch (journalReading.verdict) {
    case 'absent':    return { verdict: 'none' };
    case 'readable':  return { verdict: 'pending' };
    case 'malformed': return { verdict: 'malformed', location: localStoreLayoutOf(workspace).holdJournalPath, reason: journalReading.reason };
  }
}

function storedBoardReadingOf(workspace: Workspace): StoredBoardReading {
  const reading = readTracker(workspace);
  if (reading.verdict !== 'readable') return reading;
  return { verdict: 'readable', contents: reading.contents, unfinishedWrite: unfinishedWriteOf(workspace) };
}

function storedPipelineTextOf(workspace: Workspace): string | null {
  const stored = storedFileTextOf(localStoreLayoutOf(workspace).pipelineRecordPath);
  return stored.verdict === 'readable' ? stored.text : null;
}

function logRecordsReadingOf(workspace: Workspace): LogRecordsReading {
  const storedLog = LogRecordMappingUtil.storedLogOf(new LogFileIngestion(localStoreLayoutOf(workspace).logRecordPath).read());
  return storedLog.verdict === 'readable' ? { verdict: 'readable', records: storedLog.records } : { verdict: 'unreadable', reason: storedLog.reason };
}

function fileTextOrEmpty(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/** Only the progress record, the log and the gate profile runs: reading every ticket on every wake would cost too much. */
function revisionOf(workspace: Workspace): string {
  const layout = localStoreLayoutOf(workspace);
  const digest = createHash('sha256');
  digest.update(fileTextOrEmpty(layout.progressRecordPath)).update('\0').update(fileTextOrEmpty(layout.logRecordPath)).update('\0');
  // A Stop of a running profile changes only this file.
  digest.update(fileTextOrEmpty(layout.gateProfilesRecordPath)).update('\0');
  return digest.digest('hex');
}

export function createLocalFilesBoardStore(options: LocalFilesBoardStoreOptions): BoardStore {
  const {
    workspace, now, lockTaker, afterFileWritten
  } = options;
  const writeOptions = {
    workspace, now, lockTaker, ...(afterFileWritten === undefined ? {} : { afterFileWritten })
  };

  async function apply<Command extends ControlCommand>(request: CommandRequest<Command>): Promise<CommandWritten<ControlResultOf<Command['kind']>>> {
    const written = await writeTracker({
      ...writeOptions,
      at:     request.at,
      mutate: (transaction) => ControlService.apply(request.command, transaction, request.context),
    });
    return {
      outcome: written.result.outcome, result: written.result.result, board: written.board, unreadableRecords: written.unreadableRecords
    };
  }

  /** No timeout and no retry: the hold lasts as long as the mutation, an `await` and git inside it included. */
  async function transact<Result>(request: TransactionRequest<Result>): Promise<TransactionWritten<Result>> {
    const written = await writeTracker({ ...writeOptions, at: request.at, mutate: request.mutate });
    return { result: written.result, board: written.board, unreadableRecords: written.unreadableRecords };
  }

  const reads: StoreReadFace = Object.freeze({
    readBoard:           () => storedBoardReadingOf(workspace),
    requireBoard:        () => requireTracker(workspace),
    requireProgress:     () => requireProgressFile(workspace),
    readPipeline:        () => storedPipelineReadingOf(workspace),
    storedPipelineText:  () => storedPipelineTextOf(workspace),
    readGateProfiles:    () => GateProfilesFile.read(localStoreLayoutOf(workspace).gateProfilesRecordPath),
    readLogRecords:      () => logRecordsReadingOf(workspace),
    listTickets:         () => ticketListingOf(listTickets(workspace)),
    readUnfinishedWrite: () => unfinishedWriteOf(workspace),
    revision:            () => revisionOf(workspace),
    locationOf:          (reference: RecordReference) => singleRecordFilePathOf(workspace, reference),
  });

  return Object.freeze({
    commands:     Object.freeze({ apply }),
    transactions: Object.freeze({ transact }),
    reads,
    initialise:   (newTracker: NewTracker) => createTracker(workspace, newTracker, now, lockTaker),
  });
}
