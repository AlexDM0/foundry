/**
 * Reads one tracker's stored files without the lock, the progress file, its stored log and the ticket listing, as a verdict or a refusal.
 * The stored pipeline is judged here once, so every read and every write sees the same reading.
 */
import { LogFileIngestion }                                from '../../adapters/log/LogFileIngestion.ts';
import { LogRecordMappingUtil }                            from '../../adapters/log/utils/LogRecordMappingUtil.ts';
import { ConstitutionSourcesFile }                         from '../../adapters/pipeline/ConstitutionSourcesFile.ts';
import { GateProfilesFile }                                from '../../adapters/pipeline/GateProfilesFile.ts';
import { PipelineFile, type PipelineReading }              from '../../adapters/pipeline/PipelineFile.ts';
import { PipelineSetupFile }                               from '../../adapters/pipeline/PipelineSetupFile.ts';
import { ProgressFileIngestion, type ProgressFileReading } from '../../adapters/progress/ProgressFileIngestion.ts';
import type { Pipeline }                                   from '../../lib/tracker-model/@types/Pipeline.ts';
import type { TrackerProgress }                            from '../../lib/tracker-model/@types/TrackerProgress.ts';
import type { UnreadableTracker }                          from '../../shared/@types/UnreadableTracker.ts';
import { OperationRefusal }                                from '../../shared/OperationRefusal.ts';
import type { BoardContents }                              from './@types/BoardRecords.ts';
import { listDrafts }                                      from './DraftStore.ts';
import { listEpics }                                       from './EpicStore.ts';
import { localStoreLayoutOf }                              from './LocalStoreLayout.ts';
import { projectLocationOf }                               from './ProjectLocation.ts';
import { listTickets, ticketListingOf }                    from './TicketStore.ts';
import type { Workspace }                                  from './Workspace.ts';

export type TrackerReading = { verdict: 'readable'; contents: BoardContents } | UnreadableTracker;

/** The board as a write opens it: the contents, and each listed ticket's file by its id, which only the adapter knows. */
export interface LocalBoardContents {
  contents:        BoardContents;
  ticketLocations: ReadonlyMap<string, string>;
}

type LocalTrackerReading = { verdict: 'readable' } & LocalBoardContents | UnreadableTracker;

function progressFileReadingOf(workspace: Workspace): Extract<ProgressFileReading, { verdict: 'readable' }> | UnreadableTracker {
  const { progressRecordPath } = localStoreLayoutOf(workspace);
  const progressReading = new ProgressFileIngestion(progressRecordPath).read();
  if (progressReading.verdict === 'absent') return { verdict: 'absent', filePath: progressRecordPath };
  if (progressReading.verdict === 'unreadable') {
    return {
      verdict:        'unreadable',
      unreadableFile: 'progress-file',
      filePath:       progressRecordPath,
      reason:         progressReading.reason,
    };
  }
  return progressReading;
}

/**
 * Only a tracker at its repository's root holds entities, since an entity's home is a repository folder. The prefix is read only for a
 * pipeline that holds entities, so a pipeline without them reads no more than before.
 */
export function folderPrefixHoldingEntitiesOf(workspace: Workspace, pipeline: Readonly<Pipeline> | null): string | null {
  if (pipeline?.entities === undefined) return null;
  const { projectPrefix } = projectLocationOf(workspace.rootDirectory);
  return projectPrefix === '' ? null : projectPrefix;
}

/** The stored pipeline as the store judges it: one with entities in a tracker in a folder reads as malformed, the reading a write opens the Board on. */
export function storedPipelineReadingOf(workspace: Workspace): PipelineReading {
  const reading = PipelineFile.read(localStoreLayoutOf(workspace).pipelineRecordPath);
  if (reading.verdict !== 'readable') return reading;
  const projectPrefix = folderPrefixHoldingEntitiesOf(workspace, reading.pipeline);
  return projectPrefix === null ? reading : PipelineFile.entitiesInAFolderReadingOf(projectPrefix);
}

/** A broken progress file is the verdict even beside a broken log. */
function readLocalTracker(workspace: Workspace): LocalTrackerReading {
  const progressReading = progressFileReadingOf(workspace);
  if (progressReading.verdict !== 'readable') return progressReading;

  const storedLog = LogRecordMappingUtil.storedLogOf(new LogFileIngestion(localStoreLayoutOf(workspace).logRecordPath).read());
  if (storedLog.verdict === 'unreadable') {
    return {
      verdict:        'unreadable',
      unreadableFile: 'log-file',
      filePath:       localStoreLayoutOf(workspace).logRecordPath,
      reason:         storedLog.reason,
    };
  }

  const ticketListing = listTickets(workspace);
  const layout = localStoreLayoutOf(workspace);
  return {
    verdict:         'readable',
    ticketLocations: ticketListing.ticketLocations,
    contents:        {
      progress:                   progressReading.progress,
      pipelineReading:            storedPipelineReadingOf(workspace),
      pipelineSetupReading:       PipelineSetupFile.read(layout.pipelineSetupRecordPath),
      gateProfilesReading:        GateProfilesFile.read(layout.gateProfilesRecordPath),
      constitutionSourcesReading: ConstitutionSourcesFile.read(layout.constitutionSourcesRecordPath),
      storedLog:                  { records: storedLog.records },
      listing:                    ticketListingOf(ticketListing),
      epicListing:                listEpics(workspace),
      draftListing:               listDrafts(workspace),
    },
  };
}

export function readTracker(workspace: Workspace): TrackerReading {
  const reading = readLocalTracker(workspace);
  return reading.verdict === 'readable' ? { verdict: 'readable', contents: reading.contents } : reading;
}

/** Unrepaired: no command repairs a tracker it cannot read, and under the lock the files were there a moment ago. */
export function requireTracker(workspace: Workspace): BoardContents {
  return requireLocalTracker(workspace).contents;
}

/** `requireTracker` with each listed ticket's file, for the hold that writes the tickets back. */
export function requireLocalTracker(workspace: Workspace): LocalBoardContents {
  const reading = readLocalTracker(workspace);
  if (reading.verdict !== 'readable') throw new OperationRefusal('unrepaired', { kind: 'unreadable-tracker', reading });
  return { contents: reading.contents, ticketLocations: reading.ticketLocations };
}

/** For the progress-only reads (`concurrency`, `status`, `decisions`): log.jsonl is not read, so a broken log does not stop them. */
export function requireProgressFile(workspace: Workspace): TrackerProgress {
  const reading = progressFileReadingOf(workspace);
  if (reading.verdict !== 'readable') throw new OperationRefusal('unrepaired', { kind: 'unreadable-tracker', reading });
  return reading.progress;
}
