/** The causes a build job ends with, which the log stores and the notices read back. */
export const BUILD_JOB_CAUSES = {
  noReport:           'no-report',
  attribution:        'attribution',
  setupFailed:        'setup-failed',
  outOfCalls:         'out-of-calls',
  gateFailed:         'gate-failed',
  gateCannotRun:      'gate-cannot-run',
  cannotBuild:        'cannot-build',
  sandboxUnavailable: 'sandbox-unavailable',
  targetConflict:     'target-conflict',
  targetGateRed:      'target-gate-red',
  reReviewFailed:     're-review-failed',
} as const;
