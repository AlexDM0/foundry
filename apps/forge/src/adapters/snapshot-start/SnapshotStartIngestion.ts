/** A snapshot agent's start, `pipeline-agent-start.json` or `document-agent-start.json` in its job folder: read, validate, map. */
import { JsonRecordUtil }         from '../../lib/json-record/JsonRecordUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';

export const SNAPSHOT_START_FORMAT_VERSION = 1;

/** Every ref's commit and the hooks folder's digest when the instance launched, the shape Customs compares a turn end with. */
export interface StoredLaunchSnapshot {
  refs:              Readonly<Record<string, string>>;
  hooksFolderDigest: string | null;
}

/** What a turn end's Customs holds the snapshot to: its HEAD and every ref when the job's current instance launched. */
export interface SnapshotStart {
  startCommit:    string;
  launchSnapshot: StoredLaunchSnapshot;
}

export type SnapshotStartReading =
  | { verdict: 'readable'; snapshotStart: SnapshotStart }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

type LaunchSnapshotReading = { verdict: 'readable'; launchSnapshot: StoredLaunchSnapshot } | { verdict: 'unreadable'; reason: string };

function launchSnapshotReadingOf(value: unknown): LaunchSnapshotReading {
  const launchSnapshot = JsonRecordUtil.recordOf(value);
  if (launchSnapshot === undefined) return { verdict: 'unreadable', reason: 'its launchSnapshot is not an object' };
  const refs = JsonRecordUtil.recordOf(launchSnapshot['refs']);
  if (refs === undefined || !Object.values(refs).every((commit) => typeof commit === 'string')) {
    return { verdict: 'unreadable', reason: 'its launchSnapshot.refs is not an object of commits' };
  }
  const { hooksFolderDigest } = launchSnapshot;
  if (hooksFolderDigest !== null && typeof hooksFolderDigest !== 'string') {
    return { verdict: 'unreadable', reason: 'its launchSnapshot.hooksFolderDigest is neither text nor null' };
  }
  return { verdict: 'readable', launchSnapshot: { refs: refs as Record<string, string>, hooksFolderDigest } };
}

export class SnapshotStartIngestion {
  constructor(private readonly snapshotStartFilePath: string) {}

  /** Never throws: a file that exists but cannot be read, parsed or trusted whole is `unreadable`, never `absent`. */
  read(): SnapshotStartReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.snapshotStartFilePath, SNAPSHOT_START_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { startCommit, launchSnapshot } = stored.document;
    if (typeof startCommit !== 'string' || startCommit === '') return { verdict: 'unreadable', reason: 'its startCommit is not a commit' };
    const launchSnapshotReading = launchSnapshotReadingOf(launchSnapshot);
    if (launchSnapshotReading.verdict === 'unreadable') return launchSnapshotReading;
    return { verdict: 'readable', snapshotStart: { startCommit, launchSnapshot: launchSnapshotReading.launchSnapshot } };
  }
}
