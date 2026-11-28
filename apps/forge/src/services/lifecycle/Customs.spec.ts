/**
 * The Customs decisions that read no git: the retried attempt, the definition-file pattern, and the content, document, acceptance and report
 * checks. Path comparisons run under the Windows path module, so git's `C:/` spelling and a joined backslash path are shown to meet.
 * The checks that read the repository are held in `Customs.verification.spec.ts`, since what they decide is what git answers.
 */
import { posix, win32 } from 'node:path';

import { expect, test } from 'bun:test';

import type { LogRecord }                 from '../../domain/tracker-model/@types/LogRecord.ts';
import { type GitPathStyle, GitPaths }    from '../../lib/git/GitPaths.ts';
import { fakeAgentAdapter }               from '../../testing/FakeAgentAdapter.ts';
import type { CustomsSubject }            from './@types/CustomsSubject.ts';
import type { VerificationCheck }         from './@types/CustomsVerdict.ts';
import type { RefMovesAllowed }           from './@types/RefMoves.ts';
import { CHECKS_OF_ROLE, CUSTOMS_CHECKS } from './Customs.ts';
import { CustomsAgentConfigCheck }        from './CustomsAgentConfigCheck.ts';
import { CustomsDefinitionFilesCheck }    from './CustomsDefinitionFilesCheck.ts';
import { CustomsHistoryChecks }           from './CustomsHistoryChecks.ts';
import { CustomsRefMovesCheck }           from './CustomsRefMovesCheck.ts';

const AT = '2026-10-28T10:00:00+01:00';
const TICKET_BODY = '## Report\nExample report.\n\n## Acceptance\nA1. The example page loads.\n';
const EXAMPLE_COMMIT = 'example-commit';
/** The fake agent's naming, which is Claude Code's. */
const AGENT_NAMING = fakeAgentAdapter();
const PLANTED_CONFIGURATION_NAMES = { folderNames: ['.planted-agent'], fileNames: ['planted-agent.toml'] };
const PLANTED_ATTRIBUTION_PATTERNS = [/^Planted-Agent-Commit:/im];

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
    role:                'builder',
    worktreePath:        '/no-repository-is-read-by-these-checks',
    startCommit:         EXAMPLE_COMMIT,
    report:              builderReport(),
    ticketBody:          TICKET_BODY,
    contentHashAtLaunch: '0123456789abcdef',
    ticketContentHash:   '0123456789abcdef',
    launchSnapshot:      { refs: {}, hooksFolderDigest: null },
    refMovesAllowed:     {
      ownBranch: 'example-branch', otherJobBranches: [], loggedJobBranches: [], recordedLandings: [], removedAfterLandings: [], airlockWorktreeHeads: []
    },
    agentNaming: AGENT_NAMING,
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
  expect(CustomsHistoryChecks.retriedFailedBuildJobIdOf(records, 'J5')).toBe('J2');
  expect(CustomsHistoryChecks.retriedFailedBuildJobIdOf(records, 'J2')).toBeNull();
  expect(CustomsHistoryChecks.retriedFailedBuildJobIdOf(records, 'J3')).toBeNull();
  expect(CustomsHistoryChecks.retriedFailedBuildJobIdOf(records, 'J9')).toBeNull();
});

test('V6 passes while the ticket holds the content hash its launch recorded, and refuses once it holds another', () => {
  expect(refusalOf('V6', builderSubject())).toBeNull();
  expect(refusalOf('V6', builderSubject({ ticketContentHash: 'fedcba9876543210' }))).toBe('ticket-content-changed');
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

test('V8 reads the Acceptance of a ticket with documents from its spec, not its body', () => {
  const specWithTwoItems = '## Acceptance\n\nA1. The basket shows.\nA2. The total shows.\n';
  const builderWithA1 = builderSubject({ acceptanceText: specWithTwoItems });
  expect(refusalOf('V8', builderWithA1)).toBe('acceptance-without-evidence');
  expect(refusalOf('V8', builderSubject())).toBeNull();
});

test('V18 passes while the ticket\'s document heads are those its launch recorded, also for a ticket without documents', () => {
  expect(refusalOf('V18', builderSubject())).toBeNull();
  expect(refusalOf('V18', builderSubject({ documentVersionsAtLaunch: 'spec:a plan:b', ticketDocumentVersions: 'spec:a plan:b' }))).toBeNull();
  const changedSpec = builderSubject({ documentVersionsAtLaunch: 'spec:a plan:b', ticketDocumentVersions: 'spec:c plan:b' });
  expect(refusalOf('V18', changedSpec)).toBe('ticket-documents-changed');
});

test('V18 runs in the builder, reviewer and Airlock agent columns, and a document agent runs the snapshot checks of the pipeline agent', () => {
  expect([CHECKS_OF_ROLE.builder, CHECKS_OF_ROLE.reviewer, CHECKS_OF_ROLE['airlock-agent']].map((checks) => checks.includes('V18'))).toEqual([true, true, true]);
  expect(CHECKS_OF_ROLE['document-agent']).toEqual(CHECKS_OF_ROLE['pipeline-agent']);
});

test('a definition-file pattern reads as a git pathspec glob: a bare name at any depth, an inner / anchored, a trailing / a folder', () => {
  const matches = (pattern: string, path: string): boolean => CustomsDefinitionFilesCheck.definitionFilePatternExpressionOf(pattern).test(path);

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
  ownBranch: 'ticket-020', otherJobBranches: [], loggedJobBranches: [], recordedLandings: [], removedAfterLandings: [], airlockWorktreeHeads: []
};

test('on Windows a detached refresh worktree\'s own HEAD, listed by git as C:/ and named by a joined path, does not read as moved', () => {
  const refreshHead = 'HEAD:C:/Example/Repository/.claude/worktrees/refresh-group-example';
  const allowed = { ...NO_REF_MOVES, airlockWorktreeHeads: ['HEAD:C:\\Example\\Repository\\.claude\\worktrees\\refresh-group-example'] };
  const snapshots = { launchRefs: { [refreshHead]: 'commit-before' }, nowRefs: { [refreshHead]: 'commit-after' } };
  expect(CustomsRefMovesCheck.foreignRefsMovedOf(WINDOWS_STYLE, snapshots, allowed, 'C:\\Example\\Repository\\.claude\\worktrees\\ticket-020')).toEqual([]);
  expect(CustomsRefMovesCheck.foreignRefsMovedOf(WINDOWS_STYLE, snapshots, NO_REF_MOVES, 'C:\\Example\\Repository\\.claude\\worktrees\\ticket-020')).toEqual([refreshHead]);
});

test('on Windows the job\'s own detached HEAD, listed as C:/ and named by a joined path, does not read as moved; another worktree\'s does', () => {
  const ownHead = 'HEAD:C:/Example/Repository/.claude/worktrees/ticket-020';
  const otherHead = 'HEAD:C:/Example/Repository/.claude/worktrees/ticket-021';
  const snapshots = { launchRefs: { [ownHead]: 'commit-before', [otherHead]: 'commit-before' }, nowRefs: { [ownHead]: 'commit-after', [otherHead]: 'commit-after' } };
  expect(CustomsRefMovesCheck.foreignRefsMovedOf(WINDOWS_STYLE, snapshots, NO_REF_MOVES, 'C:\\Example\\Repository\\.claude\\worktrees\\ticket-020')).toEqual([otherHead]);
});

test('a reader\'s snapshot that appears, moves or goes while a build runs does not read as moved; a worktree outside the folders does', () => {
  const snapshotsFolder = '/example/repository/.claude/worktrees/document-agent';
  const added   = `HEAD:${snapshotsFolder}/004-spec`;
  const moved   = `HEAD:${snapshotsFolder}/005-plan`;
  const removed = `HEAD:${snapshotsFolder}/006-spec`;
  const other   = 'HEAD:/example/repository/.claude/worktrees/ticket-021';
  const snapshots = {
    launchRefs: { [moved]: 'commit-before', [removed]: 'commit-before', [other]: 'commit-before' },
    nowRefs:    { [added]: 'commit-after', [moved]: 'commit-after', [other]: 'commit-after' },
  };
  const allowed = { ...NO_REF_MOVES, snapshotFolders: [snapshotsFolder, '/example/repository/.claude/worktrees/pipeline-agent'] };
  expect(CustomsRefMovesCheck.foreignRefsMovedOf(LINUX_STYLE, snapshots, allowed, '/example/repository/.claude/worktrees/ticket-020')).toEqual([other]);
  expect(CustomsRefMovesCheck.foreignRefsMovedOf(LINUX_STYLE, snapshots, NO_REF_MOVES, '/example/repository/.claude/worktrees/ticket-020'))
    .toEqual([added, moved, removed, other].sort());
});

test('a snapshot stored in git\'s spelling compares equal to a fresh one, so no ref reads as moved across the change', () => {
  const refs = { 'refs/heads/main': 'commit-before', 'HEAD:/example/repository/.claude/worktrees/refresh-group-example': 'commit-before' };
  expect(CustomsRefMovesCheck.foreignRefsMovedOf(LINUX_STYLE, { launchRefs: refs, nowRefs: { ...refs } }, NO_REF_MOVES, '/example/repository/.claude/worktrees/ticket-020'))
    .toEqual([]);
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
  expect(CustomsAgentConfigCheck.agentConfigPathsAmong(gitPaths, AGENT_NAMING.configurationNames, hooksFolderGitPath)).toEqual([...expected]);
});

test('the agent configuration is the names the adapter hands: a planted folder and file, at the root, and at any depth for a project tracker', () => {
  const changed = ['.planted-agent/settings.toml', 'Planted-Agent.TOML', 'apps/example/.planted-agent/rules.md', 'apps/example/planted-agent.toml'];
  const lookAlikes = ['xplanted-agent/settings.toml', 'planted-agent.toml.bak', 'planted-agentxtoml', '.planted-agent', '.claude/settings.json', '.mcp.json'];

  expect(CustomsAgentConfigCheck.agentConfigPathsAmong([...changed, ...lookAlikes], PLANTED_CONFIGURATION_NAMES, null)).toEqual(changed.slice(0, 2));
  expect(CustomsAgentConfigCheck.agentConfigPathsAmong([...changed, ...lookAlikes], PLANTED_CONFIGURATION_NAMES, null, 'apps/example')).toEqual(changed);
});

test('V7 refuses the attribution the adapter hands and forge\'s own "Generated with", and nothing the adapter does not name', () => {
  const plantedNaming = { attributionPatterns: PLANTED_ATTRIBUTION_PATTERNS };

  expect(CustomsHistoryChecks.commitMessageIsAttributed('Build the example\n\nPlanted-Agent-Commit: yes', plantedNaming)).toBe(true);
  expect(CustomsHistoryChecks.commitMessageIsAttributed('Build the example\n\nGenerated with an example tool', plantedNaming)).toBe(true);
  expect(CustomsHistoryChecks.commitMessageIsAttributed('Build the example\n\nCo-Authored-By: Claude <noreply@example.com>', plantedNaming)).toBe(false);
  expect(CustomsHistoryChecks.commitMessageIsAttributed('Build the example\n\nCo-Authored-By: Claude <noreply@example.com>', AGENT_NAMING)).toBe(true);
  expect(CustomsHistoryChecks.commitMessageIsAttributed('Build the example', AGENT_NAMING)).toBe(false);
});
