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
import { projectLocationOf }                               from './ProjectLocation.ts';
import { listTickets }                                     from './TicketStore.ts';
import type { Workspace }                                  from './Workspace.ts';

export type TrackerReading = { verdict: 'readable'; contents: BoardContents } | UnreadableTracker;

function progressFileReadingOf(workspace: Workspace): Extract<ProgressFileReading, { verdict: 'readable' }> | UnreadableTracker {
  const progressReading = new ProgressFileIngestion(workspace.progressFilePath).read();
  if (progressReading.verdict === 'absent') return { verdict: 'absent', filePath: workspace.progressFilePath };
  if (progressReading.verdict === 'unreadable') {
    return {
      verdict:        'unreadable',
      unreadableFile: 'progress-file',
      filePath:       workspace.progressFilePath,
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
  const reading = PipelineFile.read(workspace.pipelineFilePath);
  if (reading.verdict !== 'readable') return reading;
  const projectPrefix = folderPrefixHoldingEntitiesOf(workspace, reading.pipeline);
  return projectPrefix === null ? reading : PipelineFile.entitiesInAFolderReadingOf(projectPrefix);
}

/** A broken progress file is the verdict even beside a broken log. */
export function readTracker(workspace: Workspace): TrackerReading {
  const progressReading = progressFileReadingOf(workspace);
  if (progressReading.verdict !== 'readable') return progressReading;

  const storedLog = LogRecordMappingUtil.storedLogOf(new LogFileIngestion(workspace.logFilePath).read());
  if (storedLog.verdict === 'unreadable') {
    return {
      verdict:        'unreadable',
      unreadableFile: 'log-file',
      filePath:       workspace.logFilePath,
      reason:         storedLog.reason,
    };
  }

  return {
    verdict:  'readable',
    contents: {
      progress:                   progressReading.progress,
      pipelineReading:            storedPipelineReadingOf(workspace),
      pipelineSetupReading:       PipelineSetupFile.read(workspace.pipelineSetupFilePath),
      gateProfilesReading:        GateProfilesFile.read(workspace.gateProfilesFilePath),
      constitutionSourcesReading: ConstitutionSourcesFile.read(workspace.constitutionSourcesFilePath),
      storedLog:                  { records: storedLog.records },
      listing:                    listTickets(workspace),
      epicListing:                listEpics(workspace),
      draftListing:               listDrafts(workspace),
    },
  };
}

/** Unrepaired: no command repairs a tracker it cannot read, and under the lock the files were there a moment ago. */
export function requireTracker(workspace: Workspace): BoardContents {
  const reading = readTracker(workspace);
  if (reading.verdict !== 'readable') throw new OperationRefusal('unrepaired', { kind: 'unreadable-tracker', reading });
  return reading.contents;
}

/** For the progress-only reads (`concurrency`, `oversee status`, `decisions`): log.jsonl is not read, so a broken log does not stop them. */
export function requireProgressFile(workspace: Workspace): TrackerProgress {
  const reading = progressFileReadingOf(workspace);
  if (reading.verdict !== 'readable') throw new OperationRefusal('unrepaired', { kind: 'unreadable-tracker', reading });
  return reading.progress;
}
