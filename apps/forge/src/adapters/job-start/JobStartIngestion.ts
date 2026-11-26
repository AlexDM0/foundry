/** `start.json`, what a worktree job's first launch kept for its verification, read into the job's start: read, validate, map. */
import { JsonRecordUtil }         from '../../lib/json-record/JsonRecordUtil.ts';
import type { EntityKey }         from '../../lib/tracker-model/@types/Pipeline.ts';
import { JobFileShapeUtil }       from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';

export const JOB_START_FORMAT_VERSION = 1;

/** What V13 and V14 compare the job's end with: every ref's commit, and the hooks folder's digest, `null` when the folder is missing. */
export interface LaunchSnapshotRecord {
  refs:              Readonly<Record<string, string>>;
  hooksFolderDigest: string | null;
}

export interface JobStart {
  startCommit:               string;
  contentHashAtLaunch:       string;
  /** The ticket's document heads at launch, which V18 compares with; absent for a ticket without documents. */
  documentVersionsAtLaunch?: string;
  launchSnapshot:            LaunchSnapshotRecord;
  /** A package build's home entity, whose gates its run leaves out (strategy 4.2); absent for every other job. */
  homeEntity?:               EntityKey;
  /** A package build's dependents whose fix tickets are in its ticket's group, whose gates its run also leaves out (E26). */
  dependentsFixedInGroup?:   EntityKey[];
}

export type JobStartReading =
  | { verdict: 'readable'; start: JobStart }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

function launchSnapshotProblemOf(snapshot: unknown): string | null {
  if (!JsonRecordUtil.valueIsAPlainObject(snapshot)) return 'its "launchSnapshot" is not an object';
  return JobFileShapeUtil.firstFieldProblemOf(snapshot, {
    refs:              [JobFileShapeUtil.valueIsATextRecord, 'a record of commits'],
    hooksFolderDigest: [JobFileShapeUtil.valueIsTextOrNull, 'text or null'],
  }, 'launchSnapshot.');
}

export class JobStartIngestion {
  constructor(private readonly startFilePath: string) {}

  /** Never throws: a start that cannot be read whole is `unreadable`, and none of its fields is handed out. */
  read(): JobStartReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.startFilePath, JOB_START_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const problem = JobFileShapeUtil.firstFieldProblemOf(document, {
      startCommit:              [JobFileShapeUtil.valueIsText, 'text'],
      contentHashAtLaunch:      [JobFileShapeUtil.valueIsText, 'text'],
      documentVersionsAtLaunch: [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsText), 'text'],
      homeEntity:               [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsText), 'an entity key'],
      dependentsFixedInGroup:   [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsATextList), 'a list of entity keys'],
    }) ?? launchSnapshotProblemOf(document['launchSnapshot']);
    if (problem !== null) return { verdict: 'unreadable', reason: problem };
    const snapshot = document['launchSnapshot'] as LaunchSnapshotRecord;
    const documentVersionsAtLaunch = document['documentVersionsAtLaunch'] as string | undefined;
    const homeEntity = document['homeEntity'] as EntityKey | undefined;
    const dependentsFixedInGroup = document['dependentsFixedInGroup'] as EntityKey[] | undefined;
    return {
      verdict: 'readable',
      start:   {
        startCommit:         document['startCommit'] as string,
        contentHashAtLaunch: document['contentHashAtLaunch'] as string,
        ...(documentVersionsAtLaunch === undefined ? {} : { documentVersionsAtLaunch }),
        launchSnapshot:      { refs: { ...snapshot.refs }, hooksFolderDigest: snapshot.hooksFolderDigest },
        ...(homeEntity === undefined ? {} : { homeEntity }),
        ...(dependentsFixedInGroup === undefined ? {} : { dependentsFixedInGroup: [...dependentsFixedInGroup] }),
      },
    };
  }
}
