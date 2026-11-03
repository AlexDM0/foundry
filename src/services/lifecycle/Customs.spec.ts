/**
 * The Customs decisions that read no git: which attempt a build retries, how a board's definition-file pattern reads, and V6 and V8, which
 * judge the ticket body and the report alone. V13's and V14's path comparisons run here under the Windows path module, so git's `C:/`
 * spelling and a joined backslash path are shown to meet on this machine. Every check that reads the repository is held on one of the fake
 * git by `src/services/lifecycle/Customs.verification.spec.ts`, because what it decides is what git answers.
 */
import { posix, win32 } from 'node:path';

import { expect, test } from 'bun:test';

import { type GitPathStyle, GitPaths } from '../../lib/git/GitPaths.ts';
import type { LogRecord }              from '../../lib/tracker-model/@types/LogRecord.ts';
import { TicketBodyHashUtil }          from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import {
  agentConfigPathsAmong,
  CUSTOMS_CHECKS,
  type CustomsSubject,
  definitionFilePatternExpressionOf,
  foreignRefsMovedOf,
  type RefMovesAllowed,
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

const WINDOWS_STYLE: GitPathStyle = { pathModule: win32, foldsCase: true };
const LINUX_STYLE: GitPathStyle = { pathModule: posix, foldsCase: false };

const NO_REF_MOVES: RefMovesAllowed = {
  ownBranch: 'ticket-020', otherJobBranches: [], loggedJobBranches: [], recordedLandings: [], removedAfterLandings: [], refreshWorktreeHeads: []
};

test('on Windows a detached refresh worktree\'s own HEAD, listed by git as C:/ and named by a joined path, does not read as moved', () => {
  const refreshHead = 'HEAD:C:/Example/Repository/.claude/worktrees/refresh-group-example';
  const allowed = { ...NO_REF_MOVES, refreshWorktreeHeads: ['HEAD:C:\\Example\\Repository\\.claude\\worktrees\\refresh-group-example'] };
  const snapshots = { launchRefs: { [refreshHead]: 'commit-before' }, nowRefs: { [refreshHead]: 'commit-after' } };
  expect(foreignRefsMovedOf(WINDOWS_STYLE, snapshots, allowed, 'C:\\Example\\Repository\\.claude\\worktrees\\ticket-020')).toEqual([]);
  expect(foreignRefsMovedOf(WINDOWS_STYLE, snapshots, NO_REF_MOVES, 'C:\\Example\\Repository\\.claude\\worktrees\\ticket-020')).toEqual([refreshHead]);
});

test('on Windows the job\'s own detached HEAD, listed as C:/ and named by a joined path, does not read as moved; another worktree\'s does', () => {
  const ownHead = 'HEAD:C:/Example/Repository/.claude/worktrees/ticket-020';
  const otherHead = 'HEAD:C:/Example/Repository/.claude/worktrees/ticket-021';
  const snapshots = { launchRefs: { [ownHead]: 'commit-before', [otherHead]: 'commit-before' }, nowRefs: { [ownHead]: 'commit-after', [otherHead]: 'commit-after' } };
  expect(foreignRefsMovedOf(WINDOWS_STYLE, snapshots, NO_REF_MOVES, 'C:\\Example\\Repository\\.claude\\worktrees\\ticket-020')).toEqual([otherHead]);
});

test('a snapshot stored in git\'s spelling compares equal to a fresh one, so no ref reads as moved across the change', () => {
  const refs = { 'refs/heads/main': 'commit-before', 'HEAD:/example/repository/.claude/worktrees/refresh-group-example': 'commit-before' };
  expect(foreignRefsMovedOf(LINUX_STYLE, { launchRefs: refs, nowRefs: { ...refs } }, NO_REF_MOVES, '/example/repository/.claude/worktrees/ticket-020')).toEqual([]);
});

test.each([
  [
    'a nested hooks folder from a Windows relative path',
    ['tools/hooks/pre-commit'],
    GitPaths.relativeInsideOf(WINDOWS_STYLE, 'C:\\Example\\Worktree', 'C:\\Example\\Worktree\\tools\\hooks'),
    ['tools/hooks/pre-commit'],
  ],
  [
    'a nested hooks folder from a Windows git-printed path',
    ['tools/hooks/pre-commit'],
    GitPaths.relativeInsideOf(WINDOWS_STYLE, 'C:/Example/Worktree', 'C:\\Example\\Worktree\\Tools\\Hooks'),
    ['tools/hooks/pre-commit'],
  ],
  ['the same file beside the hooks folder', ['tools/other/pre-commit'], 'tools/hooks', []],
  [
    'agent configuration in any case',
    ['.CLAUDE/settings.json', '.MCP.json', '.Claude/agents/example.md'],
    null,
    ['.CLAUDE/settings.json', '.MCP.json', '.Claude/agents/example.md'],
  ],
  ['an honest different case outside protected names', ['Src/Example.ts', 'Docs/Claude.md', 'example.mcp.json'], null, []],
] as const)('agent configuration among git paths: %s', (_case, gitPaths, hooksFolderGitPath, expected) => {
  expect(agentConfigPathsAmong(gitPaths, hooksFolderGitPath)).toEqual([...expected]);
});
