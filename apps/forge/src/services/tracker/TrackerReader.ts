/** Reads one tracker's stored files without the lock, the progress file, its stored log and the ticket listing, as a verdict or a refusal. */
import type { StoredLog }                                        from '../../adapters/log/@types/StoredLog.ts';
import { LogFileIngestion }                                      from '../../adapters/log/LogFileIngestion.ts';
import { LogRecordMappingUtil }                                  from '../../adapters/log/utils/LogRecordMappingUtil.ts';
import { ConstitutionSourcesFile }                               from '../../adapters/pipeline/ConstitutionSourcesFile.ts';
import { GateProfilesFile }                                      from '../../adapters/pipeline/GateProfilesFile.ts';
import { PipelineFile, type PipelineReading }                    from '../../adapters/pipeline/PipelineFile.ts';
import { PipelineSetupFile }                                     from '../../adapters/pipeline/PipelineSetupFile.ts';
import { ProgressFileIngestion, type ProgressFileReading }       from '../../adapters/progress/ProgressFileIngestion.ts';
import type { GateProfilesReading }                              from '../../lib/tracker-model/@types/GateProfile.ts';
import type { ConstitutionSourcesReading, PipelineSetupReading } from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { TrackerProgress }                                  from '../../lib/tracker-model/@types/TrackerProgress.ts';
import type { UnreadableTracker }                                from '../../shared/@types/UnreadableTracker.ts';
import { OperationRefusal }                                      from '../../shared/OperationRefusal.ts';
import { listDrafts, type DraftListing }                         from './DraftStore.ts';
import { listEpics, type EpicListing }                           from './EpicStore.ts';
import { listTickets, type TicketListing }                       from './TicketStore.ts';
import type { Workspace }                                        from './Workspace.ts';

export interface TrackerContents {
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
  epicListing:                EpicListing;
  draftListing:               DraftListing;
}

export type TrackerReading = { verdict: 'readable'; contents: TrackerContents } | UnreadableTracker;

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
      pipelineReading:            PipelineFile.read(workspace.pipelineFilePath),
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
export function requireTracker(workspace: Workspace): TrackerContents {
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
