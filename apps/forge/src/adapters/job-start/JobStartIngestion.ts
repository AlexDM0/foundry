/** `start.json`, what a worktree job's first launch kept for its verification, read into the job's start: read, validate, map. */
import type { EntityKey }         from '../../domain/tracker-model/@types/Pipeline.ts';
import type { LaunchSnapshot }    from '../@types/LaunchSnapshot.ts';
import { JobFileShapeUtil }       from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';
import type { JobStartProblem }   from './@types/JobStartProblem.ts';

export const JOB_START_FORMAT_VERSION = 1;

export interface JobStart {
  startCommit:               string;
  contentHashAtLaunch:       string;
  /** The ticket's document heads at launch, which `ticketDocumentsUnchanged` compares with; absent for a ticket without documents. */
  documentVersionsAtLaunch?: string;
  launchSnapshot:            LaunchSnapshot;
  /** A package build's home entity, whose gates its run leaves out; absent for every other job. */
  homeEntity?:               EntityKey;
  /** A package build's dependents whose fix tickets are in its ticket's group, whose gates its run also leaves out. */
  dependentsFixedInGroup?:   EntityKey[];
}

export type JobStartReading =
  | { verdict: 'readable'; start: JobStart }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: JobStartProblem };

export class JobStartIngestion {
  constructor(private readonly startFilePath: string) {}

  /** Never throws: a start that cannot be read whole is `unreadable`, and none of its fields is handed out. */
  read(): JobStartReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.startFilePath, JOB_START_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const problem = JobFileShapeUtil.firstMistypedFieldOf(document, {
      startCommit:              [JobFileShapeUtil.valueIsText, 'text'],
      contentHashAtLaunch:      [JobFileShapeUtil.valueIsText, 'text'],
      documentVersionsAtLaunch: [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsText), 'text'],
      homeEntity:               [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsText), 'an-entity-key'],
      dependentsFixedInGroup:   [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsATextList), 'a-list-of-entity-keys'],
    }) ?? JobFileShapeUtil.launchSnapshotMistypedFieldOf(document['launchSnapshot']);
    if (problem !== null) return { verdict: 'unreadable', problem };
    const snapshot = document['launchSnapshot'] as LaunchSnapshot;
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
