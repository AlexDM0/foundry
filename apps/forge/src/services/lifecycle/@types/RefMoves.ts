import type { RepositoryLanding } from '../../../adapters/repository-landings/RepositoryLandings.ts';

/** V14's exemptions: refs only Hephaestus or another job moves. */
export interface RefMovesAllowed {
  ownBranch:            string;
  /** The branches of the other jobs on the board, each moved by its own session. */
  otherJobBranches:     readonly string[];
  /** The ticket branches of the jobs that ended after this job launched, which their sessions moved before ending: exempt only while they exist. */
  loggedJobBranches:    readonly string[];
  /** Each landing Hephaestus recorded, as the ref it moved and the commit it moved it to. */
  recordedLandings:     readonly { ref: string; commit: string }[];
  /** The branches Hephaestus deletes after a landing, a released group's and each landed ticket's: exempt only once gone. */
  removedAfterLandings: readonly string[];
  /**
   * The detached HEADs of the Airlock's refresh worktrees and constitution commit worktrees, keyed `HEAD:<path>`: added, moved and removed
   * by Hephaestus alone.
   */
  airlockWorktreeHeads: readonly string[];
  /**
   * The folders of the detached snapshots Hephaestus adds, resets and removes for the agents that only read, whatever job is verified: the
   * HEAD of every worktree inside one moves by Hephaestus's hand alone.
   */
  snapshotFolders?:     readonly string[];
  /** Absent: every ref is watched, as for a tracker whose branches keep their bare names. */
  watchedRefs?:         WatchedRefs;
}

/**
 * The refs a tracker that names its branches in a namespace owns. Every other branch, tag, stash, remote and detached HEAD belongs to a
 * sibling tracker or a person working beside it, and moves without failing the job.
 */
export interface WatchedRefs {
  mainLine:        string;
  /** `BranchNames.namespacePrefix`: the tracker's ticket and group branches all start with it. */
  namespacePrefix: string;
  /** A detached HEAD below it is one of the tracker's own worktrees'. */
  worktreesRoot:   string;
}

/** What a tracker sharing its repository adds to V14: every tracker's journaled landings, and the refs it watches. */
export interface SharedRepositoryRefs {
  /** The landing journal's entries: the branch each landing moved, as its tracker names it, and the commit it moved it to. */
  journaledLandings: readonly Pick<RepositoryLanding, 'target' | 'commit'>[];
  watchedRefs:       WatchedRefs | null;
}

/** How Hephaestus names the refs around its landings, which the log records only by ticket and target. */
export interface HephaestusRefNaming {
  /** The job being verified: only the jobs ending after its launch moved a ticket branch past its launch snapshot. */
  ownJobId:                     string;
  ownBranch:                    string;
  otherJobBranches:             readonly string[];
  ticketBranchOf:               (ticketId: string) => string;
  /** The group branch landing this ticket on the main line releases and deletes; `null` for a ticket releasing no group. */
  releasedGroupBranchOf:        (ticketId: string) => string | null;
  refreshWorktreeOf:            (groupBranch: string) => string;
  constitutionCommitWorktreeOf: (jobId: string) => string;
  /** The folders holding the readers' detached snapshots, the document agents' and the pipeline agent's; none when absent. */
  snapshotFolders?:             readonly string[];
}
