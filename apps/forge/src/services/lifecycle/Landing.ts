/**
 * Landing a gated commit on its target, inside the caller's `writeTracker` hold: the target's tip is read and compared with the tip the
 * merge was made against before anything moves, then main is fast-forwarded in the main checkout, or a group branch by `merge --ff-only`
 * in its worktree. Every refusal is a wordless verdict naming the outcome the Overseer acts on, so a refused landing never loops. A tracker
 * in a project folder of its repository lands under the repository's landing lock and journals each landing for its siblings.
 */
import { TicketAcceptanceUtil }                            from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import { fastForwardTo, readCurrentBranch }                from '../../lib/git/BranchIntegration.ts';
import { GitProcess, type GitHookPolicy }                  from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                    from '../../lib/git/GitWorktrees.ts';
import type { CheckoutWritePrimitives }                    from '../../lib/git/HeldCheckout.ts';
import { RepositoryLandings, type RepositoryLandingFiles } from '../../lib/git/RepositoryLandings.ts';
import type { Ticket }                                     from '../../lib/tracker-model/@types/Ticket.ts';
import { OperationRefusal }                                from '../../shared/OperationRefusal.ts';
import { LIMITS }                                          from '../../shared/constants/Limits.ts';
import { PRODUCT_NAMES }                                   from '../../shared/constants/ProductNames.ts';
import { LockGenerationSteps, type LockTaker }             from '../tracker/GenerationLock.ts';
import type { ProjectLocation }                            from '../tracker/ProjectLocation.ts';

/**
 * A tracker in a project folder of a repository its siblings land on too: its landing holds the repository's landing lock around the tip
 * check, the fast-forward and the journal line only, never across a gate, and a tip a sibling journaled is a recorded landing.
 */
export interface SharedRepositoryLanding {
  trackerId: string;
  files:     RepositoryLandingFiles;
  now:       () => Date;
  lockTaker: LockTaker;
}

/** Main is landed in the main checkout; a group branch in the worktree it is checked out in, never by `update-ref`. */
export interface LandingTarget {
  branch:    string;
  directory: string;
}

export interface LandingRequest {
  target:                   LandingTarget;
  mergedCommit:             string;
  /** The target's tip the merge was made against: the slot's `targetTip`. */
  expectedTargetTip:        string;
  /** Tips an earlier landing recorded, so a target moved by one of them requeues rather than opening `target-moved`. */
  recordedLandings:         readonly string[];
  hookPolicy:               GitHookPolicy;
  /** Absent for a tracker at its repository's root, which lands alone, as it always has. */
  sharedRepository?:        SharedRepositoryLanding;
  /** Only a spec passes these, to fake git's write into the checkout. */
  checkoutWritePrimitives?: CheckoutWritePrimitives;
}

export type LandingRefusalReason =
  | 'landing-lock-held'
  | 'target-moved-by-a-recorded-landing'
  | 'target-moved'
  | 'not-on-target-branch'
  | 'dirty-checkout'
  | 'target-file-held'
  | 'git-failed'
  | 'acceptance-unnumbered'
  | 'acceptance-unaccounted'
  | 'acceptance-waived';

export type LandingOutcome = 'wait-for-the-landing-lock' | 'requeue-from-branch-tip' | 'open-target-moved' | 'hold-target' | 'hold-ticket' | 'finish-board-side';

/** Wordless: the caller words a refusal from these; `gitFailure` is git's own text. */
export interface LandingRefusalFacts {
  targetTip?:     string;
  gitFailure?:    string;
  blockingFiles?: readonly string[];
  /** The files another process holds open, so git could not replace them: never the owner's changes. */
  heldFiles?:     readonly string[];
  ticketId?:      string;
}

export type LandingVerdict =
  | { verdict: 'landed'; commit: string; previousTip: string }
  | { verdict: 'already-landed'; commit: string; targetTip: string }
  | { verdict: 'refused'; reason: LandingRefusalReason; facts: LandingRefusalFacts };

/** What the Overseer does with each refusal: a target-level one stops new slots on the target, a ticket-level one holds the ticket. */
export const LANDING_OUTCOME_OF_REFUSAL: Readonly<Record<LandingRefusalReason, LandingOutcome>> = {
  'landing-lock-held':                  'wait-for-the-landing-lock',
  'target-moved-by-a-recorded-landing': 'requeue-from-branch-tip',
  'target-moved':                       'open-target-moved',
  'not-on-target-branch':               'hold-target',
  'dirty-checkout':                     'hold-target',
  'target-file-held':                   'hold-target',
  'git-failed':                         'hold-target',
  'acceptance-unnumbered':              'hold-ticket',
  'acceptance-unaccounted':             'hold-ticket',
  'acceptance-waived':                  'hold-ticket',
};

/** A crash between the fast-forward and the board write is finished on the board side; it is never a refusal. */
export const ALREADY_LANDED_OUTCOME: LandingOutcome = 'finish-board-side';

const NOT_AN_ANCESTOR_EXIT_CODE = 1;

const COMMON_DIRECTORY_ARGUMENTS = ['rev-parse', '--path-format=absolute', '--git-common-dir'];

function refused(reason: LandingRefusalReason, facts: LandingRefusalFacts = {}): LandingVerdict {
  return { verdict: 'refused', reason, facts };
}

function gitFailed(gitFailure: string): LandingVerdict {
  return refused('git-failed', { gitFailure });
}

function movedTargetVerdictOf(request: LandingRequest, targetTip: string): LandingVerdict {
  const { target, mergedCommit, recordedLandings } = request;
  const ancestryArguments                          = ['merge-base', '--is-ancestor', mergedCommit, targetTip];
  const ancestry                                   = GitProcess.run(target.directory, ancestryArguments);
  // An ancestor, not tip equality: a later landing may already stand on top of this one.
  if (GitProcess.succeeded(ancestry)) return { verdict: 'already-landed', commit: mergedCommit, targetTip };
  if (ancestry === null || ancestry.exitCode !== NOT_AN_ANCESTOR_EXIT_CODE) return gitFailed(GitProcess.failureReasonOf(ancestry, ancestryArguments));
  if (recordedLandings.includes(targetTip)) return refused('target-moved-by-a-recorded-landing', { targetTip });
  return refused('target-moved', { targetTip });
}

function landAlone(request: LandingRequest): LandingVerdict {
  const {
    target, mergedCommit, expectedTargetTip, hookPolicy
  } = request;
  const currentBranch                                           = readCurrentBranch(target.directory);
  if (currentBranch.verdict === 'git-failed') return gitFailed(currentBranch.reason);
  if (currentBranch.verdict !== 'on-branch' || currentBranch.branch !== target.branch) return refused('not-on-target-branch');
  const targetTip = GitProcess.resolvedCommitOf(target.directory, `refs/heads/${target.branch}`);
  if (targetTip === null) return refused('git-failed');
  if (targetTip !== expectedTargetTip) return movedTargetVerdictOf(request, targetTip);

  const merge = fastForwardTo(target.directory, mergedCommit, hookPolicy, request.checkoutWritePrimitives);
  if (merge.verdict === 'fast-forwarded') return { verdict: 'landed', commit: merge.commit, previousTip: targetTip };
  if (merge.verdict === 'target-file-held') return refused('target-file-held', { heldFiles: merge.heldFiles, gitFailure: merge.reason.trim() });
  if (merge.blockingFiles.length > 0) return refused('dirty-checkout', { blockingFiles: merge.blockingFiles, gitFailure: merge.reason.trim() });
  return gitFailed(merge.reason.trim());
}

/**
 * Never waits: a lock a live sibling holds is `null` at once, so a tracker's own hold is never spent waiting on another tracker, and the
 * slot tries again on a later sweep. A contended attempt, a sibling taking the lock at the same moment, is tried again at once. An
 * unreadable lock record judges no process, so it is refused for a repair, `lock-record-unreadable`, as the store's lock refuses it.
 */
function underTheLandingLock(sharedRepository: SharedRepositoryLanding, land: () => LandingVerdict): LandingVerdict | null {
  const { lockDirectoryPath } = sharedRepository.files;
  const { lockTaker, now } = sharedRepository;
  const holder = lockTaker.holderOfThisProcess();
  for (let attempt = 0; attempt < LIMITS.LOCK_RETRY_COUNT; attempt++) {
    const acquired = LockGenerationSteps.attemptedAcquire(lockDirectoryPath, LockGenerationSteps.lockPayloadOf(holder, now()), lockTaker.holderIsGone);
    if (acquired.verdict === 'unreadable') throw new OperationRefusal('unrepaired', { kind: 'lock-record-unreadable', recordPath: acquired.recordPath });
    if (acquired.verdict === 'held') return null;
    if (acquired.verdict === 'contended') continue;
    try {
      return land();
    } finally {
      LockGenerationSteps.release(lockDirectoryPath, acquired.generation, LockGenerationSteps.lockPayloadOf(holder, now()));
    }
  }
  return null;
}

/**
 * Under the lock, so a sibling's landing is either journaled before the tip is read or has not moved the tip yet. A rerun that finds its
 * commit already landed but unjournaled, a stop having come between the fast-forward and the line, writes the line it owes.
 */
function landBesideSiblings(request: LandingRequest, sharedRepository: SharedRepositoryLanding): LandingVerdict {
  const { target, recordedLandings, expectedTargetTip } = request;
  const journal       = RepositoryLandings.readLandingJournal(sharedRepository.files);
  const journaledTips = journal.verdict === 'readable' ? RepositoryLandings.tipsLandedOn(journal.landings, target.branch) : [];
  const verdict       = landAlone({ ...request, recordedLandings: [...recordedLandings, ...journaledTips] });
  if (verdict.verdict === 'refused') return verdict;
  if (verdict.verdict === 'already-landed' && journaledTips.includes(verdict.commit)) return verdict;
  const previousTip = verdict.verdict === 'landed' ? verdict.previousTip : expectedTargetTip;
  // A line that cannot be written leaves this landing an unrecorded move to a sibling, which then asks before it lands again.
  RepositoryLandings.appendLanding(sharedRepository.files, {
    trackerId: sharedRepository.trackerId, target: target.branch, previousTip, commit: verdict.commit
  });
  return verdict;
}

function landOnTarget(request: LandingRequest): LandingVerdict {
  const { sharedRepository } = request;
  if (sharedRepository === undefined) return landAlone(request);
  return underTheLandingLock(sharedRepository, () => landBesideSiblings(request, sharedRepository)) ?? refused('landing-lock-held');
}

/**
 * The landing a tracker shares with its siblings, its files in the product's folder of the git common directory: `null` for a tracker at
 * its repository's root, and when git cannot name that directory, so that tracker lands alone.
 */
function sharedRepositoryLandingOf(
  location: ProjectLocation, trackerId: string, now: () => Date, lockTaker: LockTaker
): SharedRepositoryLanding | null {
  if (location.projectPrefix === '') return null;
  const { repositoryRoot } = location;
  const run = GitProcess.run(repositoryRoot, COMMON_DIRECTORY_ARGUMENTS, 'hooks-off', undefined, GitWorktrees.ceilingOf(repositoryRoot));
  const gitCommonDirectory = GitProcess.succeeded(run) ? run.standardOutput.trim() : '';
  if (gitCommonDirectory === '') return null;
  return {
    trackerId, files: RepositoryLandings.landingFilesOf(gitCommonDirectory, PRODUCT_NAMES.PROGRAM), now, lockTaker
  };
}

/** The ticket-level check a landing makes before git moves: the Acceptance, each ticket on its own. */
function ticketRefusalOf(tickets: readonly Readonly<Ticket>[]): LandingVerdict | null {
  for (const { frontmatter, body } of tickets) {
    const ticketId = frontmatter.id;
    switch (TicketAcceptanceUtil.acceptanceVerdictOf(body).verdict) {
      case 'accounted-for':
        continue;
      case 'unnumbered':
        return refused('acceptance-unnumbered', { ticketId });
      case 'unaccounted':
        return refused('acceptance-unaccounted', { ticketId });
      case 'waived-in-review-only':
        return refused('acceptance-waived', { ticketId });
    }
  }
  return null;
}

export const Landing = Object.freeze({ landOnTarget, ticketRefusalOf, sharedRepositoryLandingOf });
