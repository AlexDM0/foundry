/**
 * V12 to V14 on recorded git scenarios: what a reviewer filed must be this job's own low draft finding, read from its filing record
 * whatever triage did since; no commit or worktree file may touch agent configuration, before a launch or after a job; and no ref but
 * the job's own branch may move outside a recorded landing. Each planted case refuses with its reason, its clean twin passes. Each state is
 * a scenario `src/services/lifecycle/Customs.provenanceScenarios.integration.spec.ts` walks real git through and records; a call it did not
 * record fails the case. A file the hooks digest reads is written here, since the digest reads the folder, not git.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { LogRecord }                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import { TicketBodyHashUtil }                             from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { useRecordedGit }                                 from '../../testing/RecordedGit.ts';
import { GIT_SCENARIOS }                                  from '../../testing/RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import {
  agentConfigTouchedBeforeLaunch,
  launchSnapshotOf,
  refMovesAllowedOf,
  CUSTOMS_CHECKS,
  type CustomsSubject,
  type LaunchSnapshot,
  type VerificationCheck
} from './Customs.ts';

const TICKET_BODY = '## Acceptance\nA1. The example holds.\n';
const AT = '2026-10-28T10:00:00+01:00';
const JOB_ID = 'J7';
const MAIN_LINE = 'main';

/** Each commit a scenario names, as the replay fills it in. */
const START_COMMIT = '1'.repeat(40);
const HEAD_COMMIT = '2'.repeat(40);
const LANDED_COMMIT = '3'.repeat(40);
const MOVED_COMMIT = '4'.repeat(40);
const OWN_TIP = '5'.repeat(40);

const { enterScenario } = useRecordedGit();

let repositoryDirectory = '';
let ownBranch = MAIN_LINE;
let launchSnapshot: LaunchSnapshot = { refs: {}, hooksFolderDigest: null };

function enter(scenario: string): void {
  enterScenario(scenario, {
    repositoryDirectory,
    commits: {
      '<start>': START_COMMIT, '<head>': HEAD_COMMIT, '<landed>': LANDED_COMMIT, '<moved>': MOVED_COMMIT, '<own tip>': OWN_TIP
    },
  });
}

/** Enters the scenario and takes the launch snapshot in it. */
function launchIn(scenario: string): void {
  enter(scenario);
  launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
}

function writeFileIn(path: string, content: string): void {
  mkdirSync(dirname(join(repositoryDirectory, path)), { recursive: true });
  writeFileSync(join(repositoryDirectory, path), content);
}

function filedFinding(naming: { filedTicketId?: string; hatchRequestId?: string }): Record<string, unknown> {
  return {
    class:          'out-of-scope',
    severity:       'quality',
    file:           'example.ts',
    summary:        'Example finding',
    evidence:       'reading',
    outcome:        'filed',
    filedTicketId:  naming.filedTicketId ?? null,
    hatchRequestId: naming.hatchRequestId ?? null,
  };
}

function reviewerSubject(findings: readonly Record<string, unknown>[], logRecords: readonly LogRecord[] = []): CustomsSubject {
  return {
    role:         'reviewer',
    worktreePath: repositoryDirectory,
    startCommit:  START_COMMIT,
    report:       {
      role: 'reviewer', headCommit: HEAD_COMMIT, claims: [], findings, reviewText: 'Example review.'
    },
    ticketBody:       TICKET_BODY,
    bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(TICKET_BODY),
    jobId:            JOB_ID,
    logRecords,
    launchSnapshot,
    refMovesAllowed:  {
      ownBranch,
      otherJobBranches:     [],
      loggedJobBranches:    [],
      recordedLandings:     [],
      removedAfterLandings: [],
      refreshWorktreeHeads: [],
    },
  };
}

function jobLaunchedRecord(jobId: string, launch: { kind: 'build' | 'merge' | 'refresh'; ticketIds: string[]; target: string }): LogRecord {
  return {
    at:     AT,
    kind:   'job-launched',
    jobId,
    fields: {
      ...launch, role: null, attempt: 1, parentJobId: null
    }
  };
}

function jobEndedRecord(jobId: string, outcome: 'landed' | 'refreshed', commit: string): LogRecord {
  return {
    at: AT, kind: 'job-ended', jobId, fields: { outcome, commit, deniedPermissions: [] }
  };
}

const OWN_BUILD_JOB_ID = 'J9';

/** A live build job whose exemptions are read from the Overseer's records: ticket 378 releases `group-example`. */
function buildJobAcross(logRecords: readonly LogRecord[], refreshWorktree = ''): CustomsSubject {
  return {
    ...reviewerSubject([]),
    role:            'builder',
    refMovesAllowed: refMovesAllowedOf(logRecords, {
      ownJobId:              OWN_BUILD_JOB_ID,
      ownBranch,
      otherJobBranches:      [],
      ticketBranchOf:        (ticketId) => `ticket-${ticketId}`,
      releasedGroupBranchOf: (ticketId) => (ticketId === '378' ? 'group-example' : null),
      refreshWorktreeOf:     (groupBranch) => (groupBranch === 'group-example' ? refreshWorktree : ''),
    }),
  };
}

function filingRecord(ticketId: string, fields: Partial<{ status: string; priority: string; filedByJob: string }> = {}): LogRecord {
  return {
    at:     AT,
    kind:   'ticket-filed',
    ticketId,
    fields: {
      title: 'Example finding', status: 'draft', priority: 'low', filedByJob: JOB_ID, ...fields
    },
  };
}

function hatchAppliedRecord(requestId: string): LogRecord {
  return {
    at: AT, kind: 'hatch-applied', jobId: JOB_ID, fields: { requestId, commandKind: 'ticket-add', outcome: 'applied' }
  };
}

function refusal(check: VerificationCheck, subject: CustomsSubject): { reason: string; facts: readonly string[] } | null {
  const verdict = CUSTOMS_CHECKS[check](subject);
  return verdict.verdict === 'refused' ? { reason: verdict.reason, facts: verdict.facts } : null;
}

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('job-provenance');
  ownBranch = MAIN_LINE;
  launchIn(GIT_SCENARIOS.ONE_COMMIT);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describe('V12: every filed finding is this job\'s own low draft', () => {
  test('a finding naming its ticket passes', () => {
    expect(refusal('V12', reviewerSubject([filedFinding({ filedTicketId: '012' })], [filingRecord('012')]))).toBeNull();
  });

  test('a finding naming its request id resolves through the hatch-applied record that carries it', () => {
    const records = [filingRecord('013'), hatchAppliedRecord('R1')];
    expect(refusal('V12', reviewerSubject([filedFinding({ hatchRequestId: 'R1' })], records))).toBeNull();
  });

  test('the filing record is read, never the ticket now: a ticket submitted since still passes', () => {
    const submittedSince: LogRecord = {
      at: AT, kind: 'ticket-readied', ticketId: '012', fields: {}
    };
    expect(refusal('V12', reviewerSubject([filedFinding({ filedTicketId: '#12' })], [filingRecord('012'), submittedSince]))).toBeNull();
  });

  test('another job\'s ticket, a ticket filed above low, one filed ready and an unresolvable request each refuse', () => {
    const cases: [Record<string, unknown>, LogRecord[]][] = [
      [filedFinding({ filedTicketId: '012' }), [filingRecord('012', { filedByJob: 'J3' })]],
      [filedFinding({ filedTicketId: '012' }), [filingRecord('012', { priority: 'normal' })]],
      [filedFinding({ filedTicketId: '012' }), [filingRecord('012', { status: 'pending' })]],
      [filedFinding({ hatchRequestId: 'R9' }), [filingRecord('012'), hatchAppliedRecord('R1')]],
    ];
    for (const [finding, records] of cases) {
      expect(refusal('V12', reviewerSubject([finding], records))?.reason).toBe('finding-not-filed-by-job');
    }
  });
});

describe('V13: no change to agent configuration', () => {
  test('a commit under .claude/ refuses, even when a later commit undoes it', () => {
    enter(GIT_SCENARIOS.AGENT_CONFIG_UNDONE);
    expect(refusal('V13', reviewerSubject([]))).toEqual({ reason: 'branch-touches-agent-config', facts: ['.claude/settings.json'] });
  });

  test('an untracked .mcp.json in the worktree refuses', () => {
    writeFileIn('.mcp.json', '{}\n');
    enter(GIT_SCENARIOS.MCP_FILE_UNTRACKED);
    expect(refusal('V13', reviewerSubject([]))?.facts).toEqual(['.mcp.json']);
  });

  test('the hooks folder is core.hooksPath read from git: a change under it refuses, the same file elsewhere passes', () => {
    mkdirSync(join(repositoryDirectory, 'other-hooks'));
    mkdirSync(join(repositoryDirectory, 'example-hooks'));
    launchIn(GIT_SCENARIOS.HOOKS_PATH_SET);
    writeFileIn('other-hooks/pre-commit', 'exit 0\n');
    enter(GIT_SCENARIOS.HOOKS_PATH_OTHER_FOLDER_COMMIT);
    expect(refusal('V13', reviewerSubject([]))).toBeNull();
    writeFileIn('example-hooks/pre-commit', 'exit 0\n');
    enter(GIT_SCENARIOS.HOOKS_PATH_HOOK_COMMIT);
    expect(refusal('V13', reviewerSubject([]))?.facts).toEqual(['example-hooks/pre-commit']);
  });

  test('a hook changed under a nested core.hooksPath refuses, its digest reading no change of its own', () => {
    mkdirSync(join(repositoryDirectory, 'tools', 'git-hooks'), { recursive: true });
    launchIn(GIT_SCENARIOS.NESTED_HOOKS_PATH_SET);
    writeFileIn('tools/git-hooks/pre-commit', 'exit 0\n');
    enter(GIT_SCENARIOS.NESTED_HOOKS_PATH_HOOK_COMMIT);
    expect(refusal('V13', reviewerSubject([]))).toEqual({ reason: 'branch-touches-agent-config', facts: ['tools/git-hooks/pre-commit'] });
  });

  test.each([
    [GIT_SCENARIOS.CLAUDE_FOLDER_IN_CAPITALS, '.CLAUDE/settings.json'],
    [GIT_SCENARIOS.CLAUDE_FOLDER_CAPITALISED, '.Claude/agents/example.md'],
    [GIT_SCENARIOS.MCP_FILE_IN_CAPITALS, '.MCP.json'],
  ])('%s refuses: agent configuration matches in any case', (scenario, gitPath) => {
    writeFileIn(gitPath, '{}\n');
    enter(scenario);
    expect(refusal('V13', reviewerSubject([]))).toEqual({ reason: 'branch-touches-agent-config', facts: [gitPath] });
  });

  test('an honest different case outside the protected names passes', () => {
    enter(GIT_SCENARIOS.HONEST_CAPITALS_COMMITTED);
    expect(refusal('V13', reviewerSubject([]))).toBeNull();
  });

  test('without core.hooksPath, a hook written into .git/hooks after launch refuses by the launch digest', () => {
    const hooksFolder = join(repositoryDirectory, '.git', 'hooks');
    mkdirSync(hooksFolder, { recursive: true });
    launchIn(GIT_SCENARIOS.ONE_COMMIT);
    expect(refusal('V13', reviewerSubject([]))).toBeNull();
    writeFileSync(join(hooksFolder, 'post-checkout'), 'exit 0\n');
    expect(refusal('V13', reviewerSubject([]))?.reason).toBe('branch-touches-agent-config');
  });

  test('before a launch, the branch\'s own commits past its target are read: a target holding .claude/ passes, the branch adding it refuses', () => {
    enter(GIT_SCENARIOS.TICKET_BRANCH_MADE);
    expect(agentConfigTouchedBeforeLaunch(repositoryDirectory, MAIN_LINE).verdict).toBe('passed');
    enter(GIT_SCENARIOS.TICKET_BRANCH_ADDS_AGENT_CONFIG);
    expect(agentConfigTouchedBeforeLaunch(repositoryDirectory, MAIN_LINE)).toEqual({ verdict: 'refused', reason: 'branch-touches-agent-config', facts: ['.claude/settings.json'] });
  });
});

describe('V14: no foreign ref moved', () => {
  test('the job\'s own branch moving passes; another branch moving or appearing refuses', () => {
    enter(GIT_SCENARIOS.OWN_BRANCH_MOVED);
    expect(refusal('V14', reviewerSubject([]))).toBeNull();
    enter(GIT_SCENARIOS.FOREIGN_BRANCH_ADDED);
    expect(refusal('V14', reviewerSubject([]))).toEqual({ reason: 'foreign-ref-moved', facts: ['refs/heads/example-foreign'] });
  });

  test('a landing the Overseer recorded at the commit the ref now names passes, and another job\'s branch passes', () => {
    enter(GIT_SCENARIOS.TARGET_AND_JOB_BRANCH_ADDED);
    const subject = reviewerSubject([]);
    expect(refusal('V14', {
      ...subject,
      refMovesAllowed: {
        ownBranch,
        otherJobBranches:     ['ticket-009'],
        loggedJobBranches:    [],
        recordedLandings:     [{ ref: 'refs/heads/example-target', commit: START_COMMIT }],
        removedAfterLandings: [],
        refreshWorktreeHeads: [],
      },
    })).toBeNull();
  });

  test('another worktree\'s detached HEAD moving refuses, and a job with no launch snapshot refuses', () => {
    launchIn(GIT_SCENARIOS.DETACHED_WORKTREE_AT_START);
    enter(GIT_SCENARIOS.DETACHED_WORKTREE_MOVED);
    expect(refusal('V14', reviewerSubject([]))?.facts.some((fact) => fact.startsWith('HEAD:'))).toBe(true);
    const { launchSnapshot: _dropped, ...withoutSnapshot } = reviewerSubject([]);
    expect(refusal('V14', withoutSnapshot)?.reason).toBe('foreign-ref-moved');
  });

  test('a group release landing on the main line while a build job is live, its cleanup deleting the group and ticket branches, passes', () => {
    ownBranch = 'ticket-020';
    launchIn(GIT_SCENARIOS.GROUP_RELEASE_LAUNCHED);
    enter(GIT_SCENARIOS.GROUP_RELEASE_LANDED);
    const release = [jobLaunchedRecord('M1', { kind: 'merge', ticketIds: ['378'], target: MAIN_LINE }), jobEndedRecord('M1', 'landed', LANDED_COMMIT)];
    expect(refusal('V14', buildJobAcross(release))).toBeNull();
    expect(refusal('V14', buildJobAcross([]))?.facts).toEqual(['refs/heads/group-example', `refs/heads/${MAIN_LINE}`, 'refs/heads/ticket-378']);
  });

  test('a refresh worktree added, merged into and removed while a build job is live passes at every step', () => {
    ownBranch = 'ticket-020';
    const refreshRecords = [jobLaunchedRecord('R1', { kind: 'refresh', ticketIds: [], target: 'group-example' })];
    enter(GIT_SCENARIOS.REFRESH_WORKTREE_ADDED);
    const refreshHead = Object.keys(launchSnapshotOf(repositoryDirectory)?.refs ?? {}).find((ref) => ref.startsWith('HEAD:')) ?? '';
    const listedRefreshWorktree = refreshHead.slice('HEAD:'.length);
    expect(refusal('V14', buildJobAcross(refreshRecords, listedRefreshWorktree))).toBeNull();
    enter(GIT_SCENARIOS.REFRESH_WORKTREE_MERGED_INTO);
    expect(refusal('V14', buildJobAcross(refreshRecords, listedRefreshWorktree))).toBeNull();
    expect(refusal('V14', buildJobAcross([], listedRefreshWorktree))?.facts).toEqual([refreshHead]);
    enter(GIT_SCENARIOS.REFRESH_WORKTREE_REMOVED);
    expect(refusal('V14', buildJobAcross(refreshRecords, listedRefreshWorktree))).toBeNull();
  });

  test('a ticket landing on the main line mid-build passes, its build ending after this one launched; one ended before, or deleting it, still refuses', () => {
    ownBranch = 'ticket-020';
    launchIn(GIT_SCENARIOS.OWN_TICKET_BRANCH_MADE);
    enter(GIT_SCENARIOS.TICKET_LANDED_MID_BUILD);
    const buildLaunched = jobLaunchedRecord('J2', { kind: 'build', ticketIds: ['019'], target: MAIN_LINE });
    const ownLaunched   = jobLaunchedRecord(OWN_BUILD_JOB_ID, { kind: 'build', ticketIds: ['020'], target: MAIN_LINE });
    const buildEnded: LogRecord = {
      at: AT, kind: 'job-ended', jobId: 'J2', fields: { outcome: 'built', deniedPermissions: [] }
    };
    const landing = [
      buildLaunched,
      ownLaunched,
      buildEnded,
      jobLaunchedRecord('M1', { kind: 'merge', ticketIds: ['019'], target: MAIN_LINE }),
      jobEndedRecord('M1', 'landed', LANDED_COMMIT),
    ];
    expect(refusal('V14', buildJobAcross(landing))).toBeNull();
    expect(refusal('V14', buildJobAcross([]))?.facts).toEqual([`refs/heads/${MAIN_LINE}`, 'refs/heads/ticket-019']);
    const endedBeforeOwnLaunch = [buildLaunched, buildEnded, ownLaunched];
    expect(refusal('V14', buildJobAcross(endedBeforeOwnLaunch))?.facts).toContain('refs/heads/ticket-019');
    launchIn(GIT_SCENARIOS.LANDED_TICKET_BRANCH_REMADE);
    enter(GIT_SCENARIOS.LANDED_TICKET_BRANCH_DELETED);
    expect(refusal('V14', buildJobAcross(landing.slice(0, 1)))).toEqual({ reason: 'foreign-ref-moved', facts: ['refs/heads/ticket-019'] });
  });

  /** The cutover smoke's sequence: #002 builds while #001 is built, reviewed and landed on their shared target, its branch kept at the landing. */
  function landAnotherTicketOnTheOwnTarget(): LogRecord[] {
    ownBranch = 'ticket-002';
    launchIn(GIT_SCENARIOS.OTHER_TICKET_LAUNCHED);
    enter(GIT_SCENARIOS.OTHER_TICKET_LANDED);
    const builtEnded: LogRecord = {
      at: AT, kind: 'job-ended', jobId: 'J2', fields: { outcome: 'built', commit: LANDED_COMMIT, deniedPermissions: [] }
    };
    return [
      jobLaunchedRecord('J2', { kind: 'build', ticketIds: ['001'], target: MAIN_LINE }),
      jobLaunchedRecord(OWN_BUILD_JOB_ID, { kind: 'build', ticketIds: ['002'], target: MAIN_LINE }),
      builtEnded,
      jobLaunchedRecord('J5', { kind: 'merge', ticketIds: ['001'], target: MAIN_LINE }),
      jobEndedRecord('J5', 'landed', LANDED_COMMIT),
    ];
  }

  test('a job whose own target another ticket\'s landing moved, that ticket\'s branch kept at the landing, passes as builder and as reviewer', () => {
    const landing = landAnotherTicketOnTheOwnTarget();
    expect(refusal('V14', buildJobAcross(landing))).toBeNull();
    expect(refusal('V14', { ...buildJobAcross(landing), role: 'reviewer' })).toBeNull();
    expect(refusal('V14', buildJobAcross([]))?.facts).toEqual([`refs/heads/${MAIN_LINE}`, 'refs/heads/ticket-001']);
  });

  test('beside that landing, another protected ref moving, or the own target moving past the landed commit, still refuses', () => {
    const landing = landAnotherTicketOnTheOwnTarget();
    enter(GIT_SCENARIOS.PROTECTED_BRANCH_MOVED);
    expect(refusal('V14', buildJobAcross(landing))).toEqual({ reason: 'foreign-ref-moved', facts: ['refs/heads/example-protected'] });
    enter(GIT_SCENARIOS.OWN_TARGET_MOVED_PAST_LANDING);
    expect(refusal('V14', buildJobAcross(landing))).toEqual({ reason: 'foreign-ref-moved', facts: [`refs/heads/${MAIN_LINE}`] });
  });

  test('a job deleting another ticket\'s branch still refuses, even beside a recorded group release', () => {
    launchIn(GIT_SCENARIOS.BRANCHES_TO_DELETE_MADE);
    enter(GIT_SCENARIOS.BRANCHES_DELETED);
    const release = [jobLaunchedRecord('M1', { kind: 'merge', ticketIds: ['378'], target: 'example-main' }), jobEndedRecord('M1', 'landed', START_COMMIT)];
    expect(refusal('V14', buildJobAcross(release))).toEqual({ reason: 'foreign-ref-moved', facts: ['refs/heads/ticket-021'] });
  });
});
