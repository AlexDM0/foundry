/** What a spec that registers a board straight through `registerWithTheMonitor` tells the registry of it, read as the CLI reads it. */
import { ProgressFileIngestion }           from '../adapters/progress/ProgressFileIngestion.ts';
import { ProgressFileProblemWording }      from '../adapters/progress/ProgressFileProblemWording.ts';
import { localStoreLayoutOf }              from '../services/tracker/LocalStoreLayout.ts';
import type { MonitorRegistrationRequest } from '../services/tracker/MonitorRegistration.ts';
import type { Workspace }                  from '../services/tracker/Workspace.ts';

export function registeredBoardFactsOf(workspace: Workspace): Pick<MonitorRegistrationRequest, 'rootDirectory' | 'progress'> {
  const reading = new ProgressFileIngestion(localStoreLayoutOf(workspace).progressRecordPath).read();
  const progress: MonitorRegistrationRequest['progress'] = reading.verdict === 'readable'
    ? { verdict: 'readable', trackerId: reading.progress.trackerId, project: reading.progress.project }
    : reading.verdict === 'absent' ? { verdict: 'absent' } : { verdict: 'unreadable', reason: ProgressFileProblemWording.sentenceOf(reading.problem) };
  return { rootDirectory: workspace.rootDirectory, progress };
}
