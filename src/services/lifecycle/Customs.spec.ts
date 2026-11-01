/**
 * The Customs decisions that read no git: which attempt a build retries, how a board's definition-file pattern reads, and V6 and V8, which
 * judge the ticket body and the report alone. Every check that reads the repository is held on a real one by
 * `src/services/lifecycle/Customs.integration.spec.ts`, because what it decides is what git answers.
 */
import { expect, test } from 'bun:test';

import type { LogRecord }     from '../../lib/tracker-model/@types/LogRecord.ts';
import { TicketBodyHashUtil } from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import {
  CUSTOMS_CHECKS,
  type CustomsSubject,
  definitionFilePatternExpressionOf,
  retriedFailedBuildJobIdOf,
  type VerificationCheck
} from './Customs.ts';

const AT = '2026-10-28T10:00:00+01:00';
const TICKET_BODY = '## Report\nExample report.\n\n## Acceptance\nA1. The example page loads.\n';
const EXAMPLE_COMMIT = 'example-commit';

function builderReport(): Record<string, unknown> {
  return {
    role:              'builder',
    outcome:           'built',
    headCommit:        EXAMPLE_COMMIT,
    acceptance:        [{ item: 'A1', state: 'met', evidence: 'ExamplePage.spec.ts' }],
    alsoFixed:         [],
    gates:             [],
    handoff:           'Example handoff.',
    blockedReason:     null,
    cannotBuildReason: null,
  };
}

function builderSubject(overrides: Partial<CustomsSubject> = {}): CustomsSubject {
  return {
    role:             'builder',
    worktreePath:     '/no-repository-is-read-by-these-checks',
    startCommit:      EXAMPLE_COMMIT,
    report:           builderReport(),
    ticketBody:       TICKET_BODY,
    bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(TICKET_BODY),
    launchSnapshot:   { refs: {}, hooksFolderDigest: null },
    refMovesAllowed:  {
      ownBranch: 'example-branch', otherJobBranches: [], loggedJobBranches: [], recordedLandings: [], removedAfterLandings: [], refreshWorktreeHeads: []
    },
    ...overrides,
  };
}

function refusalOf(check: VerificationCheck, subject: CustomsSubject): string | null {
  const verdict = CUSTOMS_CHECKS[check](subject);
  return verdict.verdict === 'refused' ? verdict.reason : null;
}

test('a build retries the unbroken run of failed build attempts right before it on its ticket, and nothing after another ending', () => {
  const launched = (jobId: string, ticketId: string): LogRecord => ({
    at:     AT,
    kind:   'job-launched',
    jobId,
    fields: {
      kind: 'build', role: 'builder', ticketIds: [ticketId], attempt: 1, target: 'main', parentJobId: null
    }
  });
  const ended = (jobId: string, outcome: 'failed' | 'built'): LogRecord => ({
    at: AT, kind: 'job-ended', jobId, fields: { outcome, deniedPermissions: [] }
  });
  const records = [
    launched('J1', '002'),
    ended('J1', 'built'),
    launched('J2', '002'),
    launched('J3', '001'),
    ended('J2', 'failed'),
    launched('J4', '002'),
    ended('J4', 'failed'),
    launched('J5', '002'),
  ];
  expect(retriedFailedBuildJobIdOf(records, 'J5')).toBe('J2');
  expect(retriedFailedBuildJobIdOf(records, 'J2')).toBeNull();
  expect(retriedFailedBuildJobIdOf(records, 'J3')).toBeNull();
  expect(retriedFailedBuildJobIdOf(records, 'J9')).toBeNull();
});

test('V6 refuses a ticket body edited since launch', () => {
  expect(refusalOf('V6', builderSubject())).toBeNull();
  expect(refusalOf('V6', builderSubject({ ticketBody: `${TICKET_BODY}\nA2. Added mid-job.\n` }))).toBe('ticket-body-changed');
});

test('V8 refuses an Acceptance item the builder gave no evidence or waiver proposal for, or the reviewer no claim', () => {
  const reviewerClaims = (claims: readonly unknown[]): Record<string, unknown> => ({
    role: 'reviewer', headCommit: EXAMPLE_COMMIT, claims, findings: [], reviewText: 'Example review.'
  });
  const heldClaim = {
    item: 'A1', result: 'holds', handoffContradicted: false, note: ''
  };

  expect(refusalOf('V8', builderSubject({ report: { ...builderReport(), acceptance: [] } }))).toBe('acceptance-without-evidence');
  expect(refusalOf('V8', builderSubject({ report: { ...builderReport(), acceptance: [{ item: 'A1', state: 'waiver-proposed', evidence: '' }] } }))).toBeNull();
  expect(refusalOf('V8', builderSubject({ role: 'reviewer', report: reviewerClaims([]) }))).toBe('acceptance-without-evidence');
  expect(refusalOf('V8', builderSubject({ role: 'reviewer', report: reviewerClaims([heldClaim]) }))).toBeNull();
});

test('a definition-file pattern reads as a git pathspec glob: a bare name at any depth, an inner / anchored, a trailing / a folder', () => {
  const matches = (pattern: string, path: string): boolean => definitionFilePatternExpressionOf(pattern).test(path);

  expect(matches('package.json', 'packages/example/package.json')).toBe(true);
  expect(matches('package.json', 'package.json.bak')).toBe(false);
  expect(matches('tsconfig*.json', 'page/tsconfig.spec.json')).toBe(true);
  expect(matches('tsconfig*.json', 'tsconfig/base.json')).toBe(false);
  expect(matches('bun.lock?', 'bun.lockb')).toBe(true);
  expect(matches('.githooks/', '.githooks/pre-commit')).toBe(true);
  expect(matches('.githooks/', '.githooks')).toBe(false);
  expect(matches('ci/checks.sh', 'ci/checks.sh')).toBe(true);
  expect(matches('ci/checks.sh', 'tools/ci/checks.sh')).toBe(false);
  expect(matches('config/**/*.toml', 'config/a/b/lint.toml')).toBe(true);
  expect(matches('config/**/*.toml', 'config/lint.toml')).toBe(true);
  expect(matches('**/pyproject.toml', 'pyproject.toml')).toBe(true);
  expect(matches('**/pyproject.toml', 'example/pyproject.toml')).toBe(true);
});
