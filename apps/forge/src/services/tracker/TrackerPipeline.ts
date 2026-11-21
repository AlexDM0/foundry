/**
 * The sequence every mutating command follows, written once and all inside the lock: read the tracker into a Board, mutate, write the progress
 * file, then the pipeline when a `gate` verb or an Apply changed it, then the constitution's sources an Apply stored, then the tickets the
 * Board changed, each after the content its hash keeps, then the epics it changed or removed, then the drafts, then the gate profile runs
 * when a profile move changed one, then log.jsonl, then the setup record when a setup move changed or removed it, so the progress file is
 * never behind the tickets and an Apply closes its record last. The writes commit through the hold journal, fenced against a takeover of
 * the lock, and leave alone every file whose bytes would not change.
 */
import { createDraftFileWriter }                                                              from '../../adapters/drafts/DraftFileWriter.ts';
import { createEpicFileWriter }                                                               from '../../adapters/epics/EpicFileWriter.ts';
import type { JournaledFile }                                                                 from '../../adapters/hold-journal/HoldJournalIngestion.ts';
import { createLogFileWriter }                                                                from '../../adapters/log/LogFileWriter.ts';
import { createLogRecordCollector }                                                           from '../../adapters/log/LogRecordCollector.ts';
import { ConstitutionSourcesFile }                                                            from '../../adapters/pipeline/ConstitutionSourcesFile.ts';
import { GateProfilesFile }                                                                   from '../../adapters/pipeline/GateProfilesFile.ts';
import { PipelineFile, type PipelineReading, type UnreadablePipelineReading }                 from '../../adapters/pipeline/PipelineFile.ts';
import { PipelineSetupFile }                                                                  from '../../adapters/pipeline/PipelineSetupFile.ts';
import { createProgressFileWriter }                                                           from '../../adapters/progress/ProgressFileWriter.ts';
import { CommittedContentFile }                                                               from '../../adapters/tickets/CommittedContentFile.ts';
import { createTicketFileWriter }                                                             from '../../adapters/tickets/TicketFileWriter.ts';
import type { Board }                                                                         from '../../lib/tracker-model/Board.ts';
import { refusalIsBoardRefusal }                                                              from '../../lib/tracker-model/BoardRefusal.ts';
import { createLogger }                                                                       from '../../lib/tracker-model/Logger.ts';
import { OperationRefusal }                                                                   from '../../shared/OperationRefusal.ts';
import type { BoardContents, UnreadableRecords }                                              from './@types/BoardRecords.ts';
import { boardOfContents }                                                                    from './BoardOfContents.ts';
import type { BoardTransaction }                                                              from './BoardTransaction.ts';
import { draftFilePathOf }                                                                    from './DraftStore.ts';
import { epicFilePathOf, everyEpicFilePathIn }                                                from './EpicStore.ts';
import type { LockTaker }                                                                     from './GenerationLock.ts';
import { commitHold }                                                                         from './HoldJournal.ts';
import { createLocalRecordAllocation, type LocalRecordAllocation }                            from './LocalRecordAllocation.ts';
import { localStoreLayoutOf }                                                                 from './LocalStoreLayout.ts';
import { committedContentLocationOf, everyCommittedContentFilePathIn, everyTicketFilePathIn } from './TicketStore.ts';
import { withLock }                                                                           from './TrackerLock.ts';
import { folderPrefixHoldingEntitiesOf, requireLocalTracker }                                 from './TrackerReader.ts';
import type { Workspace }                                                                     from './Workspace.ts';

export interface TrackerWriteRequest<MutationResult> {
  workspace:         Workspace;
  /** Already resolved by the caller; the Board stamps and logs with it. */
  at:                string;
  /** The caller's clock, for the lock's records. */
  now:               () => Date;
  mutate:            (change: BoardTransaction) => MutationResult | Promise<MutationResult>;
  /** Called after each file the hold writes; the step a spec interrupts to cut the hold short. */
  afterFileWritten?: (filePath: string) => void;
  /** This process as the lock's taker, and how it judges a holder it finds. */
  lockTaker:         LockTaker;
}

export interface TrackerWritten<MutationResult> {
  result:            MutationResult;
  /** The Board just written; only this invocation holds it, so reading it after the lock is released reads what was written. */
  board:             Board;
  /** The records the read skipped, for the caller to report. */
  unreadableRecords: UnreadableRecords;
}

interface OpenBoard {
  contents:           BoardContents;
  logRecordCollector: ReturnType<typeof createLogRecordCollector>;
  board:              Board;
}

/** The pipeline a mutation would store with entities in a tracker in a folder is refused before anything is written. */
function refuseEntitiesInAFolder(workspace: Workspace, board: Board): void {
  if (!board.pipelineChanged()) return;
  const projectPrefix = folderPrefixHoldingEntitiesOf(workspace, board.pipeline());
  if (projectPrefix !== null) throw new OperationRefusal('refused', { kind: 'entities-in-a-folder', filePath: localStoreLayoutOf(workspace).pipelineRecordPath, projectPrefix });
}

function openBoard(contents: BoardContents): OpenBoard {
  const logRecordCollector = createLogRecordCollector(contents.storedLog);
  const board              = boardOfContents(contents, createLogger(logRecordCollector.collect));
  return { contents, logRecordCollector, board };
}

function unreadableRecordsOf(contents: BoardContents): UnreadableRecords {
  return { tickets: contents.listing.unreadable, epics: contents.epicListing.unreadable, drafts: contents.draftListing.unreadable };
}

function unreadablePipelineOf(reading: PipelineReading): UnreadablePipelineReading | null {
  return reading.verdict === 'older' || reading.verdict === 'malformed' ? reading : null;
}

interface PlannedHold {
  files:              JournaledFile[];
  deletedTicketCount: number;
}

/**
 * Every file the hold writes, in the order it writes them: a log line never describes an unstored change, so the log follows every file
 * but the setup record, which goes last so an Apply's close follows everything it stored.
 */
function plannedHoldOf(workspace: Workspace, openedBoard: OpenBoard, records: LocalRecordAllocation, deletesEveryTicketFile: boolean): PlannedHold {
  const { contents, logRecordCollector, board } = openedBoard;
  const written = (filePath: string, fileContents: string): JournaledFile => ({ kind: 'written', filePath, contents: fileContents });
  const removed = (filePath: string): JournaledFile => ({ kind: 'removed', filePath });
  const layout  = localStoreLayoutOf(workspace);

  const files: JournaledFile[] = [written(layout.progressRecordPath, createProgressFileWriter(layout.progressRecordPath).contentsOf(contents.progress))];
  const changedPipeline = board.pipelineChanged() ? board.pipeline() : null;
  if (changedPipeline !== null) files.push(written(layout.pipelineRecordPath, PipelineFile.contentsOf(changedPipeline)));
  const sourcesWrite = board.constitutionSourcesWrite();
  if (sourcesWrite.write === 'sources') files.push(written(layout.constitutionSourcesRecordPath, ConstitutionSourcesFile.contentsOf(sourcesWrite.sources)));
  const ticketFileWriter = createTicketFileWriter();
  for (const ticket of board.changedTickets()) {
    const location = records.storedTicketLocationOf(ticket.frontmatter.id);
    const { contentHash, title } = ticket.frontmatter;
    // Kept first: alone it is harmless, while a ticket naming a hash with no kept content reads as unreadable.
    if (contentHash !== undefined) files.push(written(committedContentLocationOf(workspace, contentHash), CommittedContentFile.contentsOf({ title, body: ticket.body })));
    files.push(written(location, ticketFileWriter.contentsOf(ticket, location)));
  }
  const epicFileWriter = createEpicFileWriter();
  for (const epic of board.changedEpics()) {
    const location = epicFilePathOf(workspace, epic.frontmatter.key);
    files.push(written(location, epicFileWriter.contentsOf(epic, location)));
  }
  for (const epic of board.removedEpics()) files.push(removed(epicFilePathOf(workspace, epic.frontmatter.key)));
  const draftFileWriter = createDraftFileWriter((draftId) => draftFilePathOf(workspace, draftId));
  for (const draft of board.changedDrafts()) files.push(written(draftFilePathOf(workspace, draft.id), draftFileWriter.contentsOf(draft)));
  for (const draft of board.removedDrafts()) files.push(removed(draftFilePathOf(workspace, draft.id)));
  const profilesWrite = board.gateProfilesWrite();
  if (profilesWrite.write === 'profiles') files.push(written(layout.gateProfilesRecordPath, GateProfilesFile.contentsOf(profilesWrite.profiles)));
  const deletedTicketFilePaths = deletesEveryTicketFile ? everyTicketFilePathIn(workspace) : [];
  files.push(...deletedTicketFilePaths.map(removed));
  if (deletesEveryTicketFile) files.push(...everyCommittedContentFilePathIn(workspace).map(removed), ...everyEpicFilePathIn(workspace).map(removed));

  const logRecordsToWrite = logRecordCollector.recordsToWrite();
  if (logRecordsToWrite !== null) files.push(written(layout.logRecordPath, createLogFileWriter(layout.logRecordPath).contentsOf(logRecordsToWrite)));
  const setupWrite = board.pipelineSetupWrite();
  if (setupWrite.write === 'record') files.push(written(layout.pipelineSetupRecordPath, PipelineSetupFile.contentsOf(setupWrite.setup)));
  if (setupWrite.write === 'removed') files.push(removed(layout.pipelineSetupRecordPath));
  return { files, deletedTicketCount: deletedTicketFilePaths.length };
}

/** A Board refusal is one the caller can act on, wrapped with its detail for the command line to word; nothing has been written when it is thrown. */
async function mutateWrappingBoardRefusals<MutationResult>(
  mutate: (change: BoardTransaction) => MutationResult | Promise<MutationResult>,
  change: BoardTransaction,
): Promise<MutationResult> {
  try {
    return await mutate(change);
  } catch (error) {
    if (refusalIsBoardRefusal(error)) throw new OperationRefusal('refused', { kind: 'board-refusal', boardRefusal: error.detail });
    throw error;
  }
}

export function writeTracker<MutationResult>(request: TrackerWriteRequest<MutationResult>): Promise<TrackerWritten<MutationResult>> {
  const {
    workspace, at, now, mutate, afterFileWritten, lockTaker
  } = request;

  return withLock(workspace, async (hold) => {
    const { contents, ticketLocations } = requireLocalTracker(workspace);
    const openedBoard                   = openBoard(contents);
    const unreadableRecords             = unreadableRecordsOf(contents);
    const records                       = createLocalRecordAllocation(workspace, openedBoard.board, unreadableRecords, ticketLocations);
    for (const ticketId of contents.listing.contentRestored) openedBoard.board.restoreKeptTicketContent(ticketId, at);

    const deletionCallbacks: ((deletedTicketCount: number) => void)[] = [];
    const result = await mutateWrappingBoardRefusals(mutate, {
      at,
      board:                          openedBoard.board,
      workspace,
      records,
      unreadableRecords,
      unreadablePipeline:             unreadablePipelineOf(openedBoard.contents.pipelineReading),
      storedLogEntryCount:            openedBoard.contents.storedLog.records.length,
      storedLogRecords:               openedBoard.contents.storedLog.records,
      deleteAllTicketFilesAfterwards: (onDeleted) => { deletionCallbacks.push(onDeleted); },
    });

    refuseEntitiesInAFolder(workspace, openedBoard.board);
    const plannedHold = plannedHoldOf(workspace, openedBoard, records, deletionCallbacks.length > 0);
    commitHold(workspace, plannedHold.files, hold, afterFileWritten);
    for (const onDeleted of deletionCallbacks) onDeleted(plannedHold.deletedTicketCount);
    return { result, board: openedBoard.board, unreadableRecords };
  }, now, lockTaker);
}
