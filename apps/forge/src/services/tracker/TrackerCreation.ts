/** Creates a new tracker's files under the lock; an existing progress file is never replaced. */
import { mkdirSync } from 'node:fs';

import { createLogFileWriter }              from '../../adapters/log/LogFileWriter.ts';
import { createProgressFileWriter }         from '../../adapters/progress/ProgressFileWriter.ts';
import { emptyProgressFor }                 from '../../domain/tracker-model/EmptyProgress.ts';
import type { NewTracker, TrackerCreation } from './@types/BoardRecords.ts';
import type { LockTaker }                   from './GenerationLock.ts';
import { localStoreLayoutOf }               from './LocalStoreLayout.ts';
import { withLock }                         from './TrackerLock.ts';
import type { Workspace }                   from './Workspace.ts';

export async function createTracker(
  workspace: Workspace,
  newTracker: NewTracker,
  now: () => Date,
  lockTaker: LockTaker,
): Promise<TrackerCreation> {
  const layout = localStoreLayoutOf(workspace);
  mkdirSync(layout.ticketRecordsFolder, { recursive: true });
  const progress = emptyProgressFor(newTracker);

  return withLock(workspace, (): TrackerCreation => {
    if (createProgressFileWriter(layout.progressRecordPath).create(progress) === 'already-exists') return { verdict: 'already-exists' };

    // A new tracker's log starts empty, so a log.jsonl left from a removed tracker is emptied, never adopted.
    // A crash between the two writes leaves that old log.jsonl beside the new progress file.
    createLogFileWriter(layout.logRecordPath).write([]);
    return { verdict: 'created' };
  }, now, lockTaker);
}
