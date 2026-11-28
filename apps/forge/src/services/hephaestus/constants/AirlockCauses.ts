export const MERGE_REFUSED_CAUSES = {
  outOfCalls:         'out-of-calls',
  cannotResolve:      'cannot-resolve',
  unresolved:         'merge-unresolved',
  noReport:           'no-report',
  reReviewFailed:     're-review-failed',
  gitFailed:          'git-failed',
  refreshConflicted:  'refresh-conflicted',
  releaseBehindGroup: 'release-behind-group',
} as const;

/** The causes a merge job ends with when it frees its slot and its ticket waits in the queue again. */
export const REQUEUE_CAUSES = { orphaned: 'orphaned', targetMoved: 'target-moved', targetHeld: 'target-held' } as const;

export const RED_RESUMES_SPENT_CAUSE = 'red-resumes-spent';
