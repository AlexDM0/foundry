/** A snapshot agent's start, `pipeline-agent-start.json` or `document-agent-start.json` in its job folder: read, validate, map. */
import type { LaunchSnapshot }    from '../@types/LaunchSnapshot.ts';
import { JobFileShapeUtil }       from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';

export const SNAPSHOT_START_FORMAT_VERSION = 1;

/** What a turn end's Customs holds the snapshot to: its HEAD and every ref when the job's current instance launched. */
export interface SnapshotStart {
  startCommit:    string;
  launchSnapshot: LaunchSnapshot;
}

export type SnapshotStartReading =
  | { verdict: 'readable'; snapshotStart: SnapshotStart }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export class SnapshotStartIngestion {
  constructor(private readonly snapshotStartFilePath: string) {}

  /** Never throws: a file that exists but cannot be read, parsed or trusted whole is `unreadable`, never `absent`. */
  read(): SnapshotStartReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.snapshotStartFilePath, SNAPSHOT_START_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { startCommit, launchSnapshot } = stored.document;
    if (typeof startCommit !== 'string' || startCommit === '') return { verdict: 'unreadable', reason: 'its startCommit is not a commit' };
    const launchSnapshotProblem = JobFileShapeUtil.launchSnapshotProblemOf(launchSnapshot);
    if (launchSnapshotProblem !== null) return { verdict: 'unreadable', reason: launchSnapshotProblem };
    const { refs, hooksFolderDigest } = launchSnapshot as LaunchSnapshot;
    return { verdict: 'readable', snapshotStart: { startCommit, launchSnapshot: { refs: { ...refs }, hooksFolderDigest } } };
  }
}
