/**
 * `mainMovedByCommits` of the setup facts: main's commits past the record's snapshot commit, read from git and never stored. It is kept by
 * (snapshot commit, main tip), so a state read asks git again only when one of them changed.
 */
import { commitCountAheadOf } from '../../lib/git/MergeTree.ts';

export class MainMovedCounts {
  private countedKey: string | null = null;
  private countedCommits = 0;

  constructor(private readonly repositoryRoot: string) {}

  /** 0 with no snapshot or no tip, or when they are the same commit; a count git cannot give is 0 and is asked again at the next read. */
  mainMovedByCommitsOf(snapshotCommit: string | null, mainTip: string | null): number {
    if (snapshotCommit === null || mainTip === null || snapshotCommit === mainTip) return 0;
    const key = `${snapshotCommit}..${mainTip}`;
    if (key === this.countedKey) return this.countedCommits;
    const count = commitCountAheadOf(this.repositoryRoot, snapshotCommit, mainTip);
    if (count === null) return 0;
    this.countedKey = key;
    this.countedCommits = count;
    return count;
  }
}
