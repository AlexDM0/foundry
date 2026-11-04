/**
 * V12 to V14 on a scratch repository of the fake git: what a reviewer filed must be this job's own low draft finding, read from its filing record
 * whatever triage did since; no commit or worktree file may touch agent configuration, before a launch or after a job; and no ref but
 * the job's own branch may move outside a recorded landing. Each planted case refuses with its reason, its clean twin passes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { LogRecord }         from '../../lib/tracker-model/@types/LogRecord.ts';
import { TicketBodyHashUtil }     from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { useFakeGit }             from '../../testing/FakeGit.ts';
import { removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
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

const fakeGit = useFakeGit();

let repositoryDirectory = '';
let startCommit = '';
let launchSnapshot: LaunchSnapshot = { refs: {}, hooksFolderDigest: null };

function headCommit(): string {
  return fakeGit.outputOf(repositoryDirectory, ['rev-parse', 'HEAD']);
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
    startCommit,
    report:       {
      role: 'reviewer', headCommit: headCommit(), claims: [], findings, reviewText: 'Example review.'
    },
    ticketBody:       TICKET_BODY,
    bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(TICKET_BODY),
    jobId:            JOB_ID,
    logRecords,
    launchSnapshot,
    refMovesAllowed:  {
      ownBranch:            fakeGit.checkedOutBranchOf(repositoryDirectory),
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
      ownBranch:             fakeGit.checkedOutBranchOf(repositoryDirectory),
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
  repositoryDirectory = fakeGit.createRepository('job-provenance');
  startCommit = fakeGit.commitFile(repositoryDirectory, 'base.ts', 'export const base = true;\n');
  launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
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
    mkdirSync(join(repositoryDirectory, '.claude'), { recursive: true });
    fakeGit.commitFile(repositoryDirectory, '.claude/settings.json', '{"hooks":{}}\n');
    fakeGit.outputOf(repositoryDirectory, ['rm', '-q', '.claude/settings.json']);
    fakeGit.outputOf(repositoryDirectory, ['-c', 'user.name=Alex Example', '-c', 'user.email=alex@example.com', 'commit', '-q', '-m', 'Undo']);
    expect(refusal('V13', reviewerSubject([]))).toEqual({ reason: 'branch-touches-agent-config', facts: ['.claude/settings.json'] });
  });

  test('an untracked .mcp.json in the worktree refuses', () => {
    writeFileSync(join(repositoryDirectory, '.mcp.json'), '{}\n');
    expect(refusal('V13', reviewerSubject([]))?.facts).toEqual(['.mcp.json']);
  });

  test('the hooks folder is core.hooksPath read from git: a change under it refuses, the same file elsewhere passes', () => {
    fakeGit.outputOf(repositoryDirectory, ['config', 'core.hooksPath', 'example-hooks']);
    mkdirSync(join(repositoryDirectory, 'other-hooks'));
    mkdirSync(join(repositoryDirectory, 'example-hooks'));
    launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
    fakeGit.commitFile(repositoryDirectory, 'other-hooks/pre-commit', 'exit 0\n');
    expect(refusal('V13', reviewerSubject([]))).toBeNull();
    fakeGit.commitFile(repositoryDirectory, 'example-hooks/pre-commit', 'exit 0\n');
    expect(refusal('V13', reviewerSubject([]))?.facts).toEqual(['example-hooks/pre-commit']);
  });

  test('a hook changed under a nested core.hooksPath refuses, its digest reading no change of its own', () => {
    fakeGit.outputOf(repositoryDirectory, ['config', 'core.hooksPath', 'tools/git-hooks']);
    mkdirSync(join(repositoryDirectory, 'tools', 'git-hooks'), { recursive: true });
    launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
    fakeGit.commitFile(repositoryDirectory, 'tools/git-hooks/pre-commit', 'exit 0\n');
    expect(refusal('V13', reviewerSubject([]))).toEqual({ reason: 'branch-touches-agent-config', facts: ['tools/git-hooks/pre-commit'] });
  });

  test.each(['.CLAUDE/settings.json', '.Claude/agents/example.md', '.MCP.json'])('a commit of %s refuses: agent configuration matches in any case', (gitPath) => {
    mkdirSync(join(repositoryDirectory, gitPath, '..'), { recursive: true });
    fakeGit.commitFile(repositoryDirectory, gitPath, '{}\n');
    expect(refusal('V13', reviewerSubject([]))).toEqual({ reason: 'branch-touches-agent-config', facts: [gitPath] });
  });

  test('an honest different case outside the protected names passes', () => {
    mkdirSync(join(repositoryDirectory, 'Src'), { recursive: true });
    fakeGit.commitFile(repositoryDirectory, 'Src/Example.ts', 'export const example = true;\n');
    fakeGit.commitFile(repositoryDirectory, 'Example.MCP.json', '{}\n');
    expect(refusal('V13', reviewerSubject([]))).toBeNull();
  });

  test('without core.hooksPath, a hook written into .git/hooks after launch refuses by the launch digest', () => {
    const hooksFolder = join(fakeGit.outputOf(repositoryDirectory, ['rev-parse', '--path-format=absolute', '--git-common-dir']), 'hooks');
    mkdirSync(hooksFolder, { recursive: true });
    launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
    expect(refusal('V13', reviewerSubject([]))).toBeNull();
    writeFileSync(join(hooksFolder, 'post-checkout'), 'exit 0\n');
    expect(refusal('V13', reviewerSubject([]))?.reason).toBe('branch-touches-agent-config');
  });

  test('before a launch, the branch\'s own commits past its target are read: a target holding .claude/ passes, the branch adding it refuses', () => {
    const target = fakeGit.checkedOutBranchOf(repositoryDirectory);
    fakeGit.outputOf(repositoryDirectory, ['checkout', '-q', '-b', 'ticket-007']);
    expect(agentConfigTouchedBeforeLaunch(repositoryDirectory, target).verdict).toBe('passed');
    mkdirSync(join(repositoryDirectory, '.claude'), { recursive: true });
    fakeGit.commitFile(repositoryDirectory, '.claude/settings.json', '{}\n');
    expect(agentConfigTouchedBeforeLaunch(repositoryDirectory, target)).toEqual({ verdict: 'refused', reason: 'branch-touches-agent-config', facts: ['.claude/settings.json'] });
  });
});

describe('V14: no foreign ref moved', () => {
  test('the job\'s own branch moving passes; another branch moving or appearing refuses', () => {
    fakeGit.commitFile(repositoryDirectory, 'feature.ts', 'export const feature = true;\n');
    expect(refusal('V14', reviewerSubject([]))).toBeNull();
    fakeGit.outputOf(repositoryDirectory, ['branch', 'example-foreign', startCommit]);
    expect(refusal('V14', reviewerSubject([]))).toEqual({ reason: 'foreign-ref-moved', facts: ['refs/heads/example-foreign'] });
  });

  test('a landing the Overseer recorded at the commit the ref now names passes, and another job\'s branch passes', () => {
    fakeGit.outputOf(repositoryDirectory, ['branch', 'example-target', startCommit]);
    fakeGit.outputOf(repositoryDirectory, ['branch', 'ticket-009', startCommit]);
    const subject = reviewerSubject([]);
    expect(refusal('V14', {
      ...subject,
      refMovesAllowed: {
        ownBranch:            fakeGit.checkedOutBranchOf(repositoryDirectory),
        otherJobBranches:     ['ticket-009'],
        loggedJobBranches:    [],
        recordedLandings:     [{ ref: 'refs/heads/example-target', commit: startCommit }],
        removedAfterLandings: [],
        refreshWorktreeHeads: [],
      },
    })).toBeNull();
  });

  test('another worktree\'s detached HEAD moving refuses, and a job with no launch snapshot refuses', () => {
    const otherWorktree = fakeGit.addWorktree(repositoryDirectory, 'example-detached');
    fakeGit.outputOf(otherWorktree, ['checkout', '-q', '--detach', startCommit]);
    launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
    fakeGit.commitFile(otherWorktree, 'moved.ts', 'export const moved = true;\n');
    expect(refusal('V14', reviewerSubject([]))?.facts.some((fact) => fact.startsWith('HEAD:'))).toBe(true);
    const { launchSnapshot: _dropped, ...withoutSnapshot } = reviewerSubject([]);
    expect(refusal('V14', withoutSnapshot)?.reason).toBe('foreign-ref-moved');
  });

  test('a group release landing on the main line while a build job is live, its cleanup deleting the group and ticket branches, passes', () => {
    const mainLine = fakeGit.outputOf(repositoryDirectory, ['rev-parse', '--abbrev-ref', 'HEAD']);
    fakeGit.outputOf(repositoryDirectory, ['branch', 'group-example', startCommit]);
    fakeGit.outputOf(repositoryDirectory, ['branch', 'ticket-378', startCommit]);
    fakeGit.outputOf(repositoryDirectory, ['checkout', '-q', '-b', 'ticket-020']);
    launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
    fakeGit.commitFile(repositoryDirectory, 'built.ts', 'export const built = true;\n');
    const landedCommit = fakeGit.commitFile(repositoryDirectory, 'released.ts', 'export const released = true;\n');
    fakeGit.outputOf(repositoryDirectory, ['branch', '-f', mainLine, landedCommit]);
    fakeGit.outputOf(repositoryDirectory, ['branch', '-D', 'group-example', 'ticket-378']);
    const release = [jobLaunchedRecord('M1', { kind: 'merge', ticketIds: ['378'], target: mainLine }), jobEndedRecord('M1', 'landed', landedCommit)];
    expect(refusal('V14', buildJobAcross(release))).toBeNull();
    expect(refusal('V14', buildJobAcross([]))?.facts).toEqual(['refs/heads/group-example', `refs/heads/${mainLine}`, 'refs/heads/ticket-378']);
  });

  test('a refresh worktree added, merged into and removed while a build job is live passes at every step', () => {
    fakeGit.outputOf(repositoryDirectory, ['checkout', '-q', '-b', 'ticket-020']);
    const refreshRecords = [jobLaunchedRecord('R1', { kind: 'refresh', ticketIds: [], target: 'group-example' })];
    const refreshWorktree = fakeGit.addWorktree(repositoryDirectory, 'refresh-group-example');
    fakeGit.outputOf(refreshWorktree, ['checkout', '-q', '--detach', startCommit]);
    fakeGit.outputOf(repositoryDirectory, ['branch', '-D', 'worktree/refresh-group-example']);
    const refreshHead = Object.keys(launchSnapshotOf(repositoryDirectory)?.refs ?? {}).find((ref) => ref.startsWith('HEAD:')) ?? '';
    const listedRefreshWorktree = refreshHead.slice('HEAD:'.length);
    expect(refusal('V14', buildJobAcross(refreshRecords, listedRefreshWorktree))).toBeNull();
    fakeGit.commitFile(refreshWorktree, 'refreshed.ts', 'export const refreshed = true;\n');
    expect(refusal('V14', buildJobAcross(refreshRecords, listedRefreshWorktree))).toBeNull();
    expect(refusal('V14', buildJobAcross([], listedRefreshWorktree))?.facts).toEqual([refreshHead]);
    fakeGit.outputOf(repositoryDirectory, ['worktree', 'remove', '--force', refreshWorktree]);
    expect(refusal('V14', buildJobAcross(refreshRecords, listedRefreshWorktree))).toBeNull();
  });

  test('a ticket landing on the main line mid-build passes, its build ending after this one launched; one ended before, or deleting it, still refuses', () => {
    const mainLine = fakeGit.outputOf(repositoryDirectory, ['rev-parse', '--abbrev-ref', 'HEAD']);
    fakeGit.outputOf(repositoryDirectory, ['checkout', '-q', '-b', 'ticket-020']);
    launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
    fakeGit.outputOf(repositoryDirectory, ['branch', 'ticket-019', startCommit]);
    fakeGit.outputOf(repositoryDirectory, ['checkout', '-q', 'ticket-019']);
    const landedCommit = fakeGit.commitFile(repositoryDirectory, 'reviewed.ts', 'export const reviewed = true;\n');
    fakeGit.outputOf(repositoryDirectory, ['branch', '-f', mainLine, landedCommit]);
    fakeGit.outputOf(repositoryDirectory, ['checkout', '-q', 'ticket-020']);
    const buildLaunched = jobLaunchedRecord('J2', { kind: 'build', ticketIds: ['019'], target: mainLine });
    const ownLaunched   = jobLaunchedRecord(OWN_BUILD_JOB_ID, { kind: 'build', ticketIds: ['020'], target: mainLine });
    const buildEnded: LogRecord = {
      at: AT, kind: 'job-ended', jobId: 'J2', fields: { outcome: 'built', deniedPermissions: [] }
    };
    const landing = [
      buildLaunched,
      ownLaunched,
      buildEnded,
      jobLaunchedRecord('M1', { kind: 'merge', ticketIds: ['019'], target: mainLine }),
      jobEndedRecord('M1', 'landed', landedCommit),
    ];
    expect(refusal('V14', buildJobAcross(landing))).toBeNull();
    expect(refusal('V14', buildJobAcross([]))?.facts).toEqual([`refs/heads/${mainLine}`, 'refs/heads/ticket-019']);
    const endedBeforeOwnLaunch = [buildLaunched, buildEnded, ownLaunched];
    expect(refusal('V14', buildJobAcross(endedBeforeOwnLaunch))?.facts).toContain('refs/heads/ticket-019');
    fakeGit.outputOf(repositoryDirectory, ['branch', '-D', 'ticket-019']);
    fakeGit.outputOf(repositoryDirectory, ['branch', 'ticket-019', startCommit]);
    launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
    fakeGit.outputOf(repositoryDirectory, ['branch', '-D', 'ticket-019']);
    expect(refusal('V14', buildJobAcross(landing.slice(0, 1)))).toEqual({ reason: 'foreign-ref-moved', facts: ['refs/heads/ticket-019'] });
  });

  /** The cutover smoke's sequence: #002 builds while #001 is built, reviewed and landed on their shared target, its branch kept at the landing. */
  function landAnotherTicketOnTheOwnTarget(): { mainLine: string; landing: LogRecord[] } {
    const mainLine = fakeGit.outputOf(repositoryDirectory, ['rev-parse', '--abbrev-ref', 'HEAD']);
    fakeGit.outputOf(repositoryDirectory, ['branch', 'ticket-001', startCommit]);
    fakeGit.outputOf(repositoryDirectory, ['branch', 'example-protected', startCommit]);
    fakeGit.outputOf(repositoryDirectory, ['checkout', '-q', '-b', 'ticket-002']);
    launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
    fakeGit.outputOf(repositoryDirectory, ['checkout', '-q', 'ticket-001']);
    const landedCommit = fakeGit.commitFile(repositoryDirectory, 'palette.txt', 'colour: Example\n');
    fakeGit.outputOf(repositoryDirectory, ['branch', '-f', mainLine, landedCommit]);
    fakeGit.outputOf(repositoryDirectory, ['checkout', '-q', 'ticket-002']);
    fakeGit.commitFile(repositoryDirectory, 'shade.txt', 'shade: Example\n');
    const builtEnded: LogRecord = {
      at: AT, kind: 'job-ended', jobId: 'J2', fields: { outcome: 'built', commit: landedCommit, deniedPermissions: [] }
    };
    const landing = [
      jobLaunchedRecord('J2', { kind: 'build', ticketIds: ['001'], target: mainLine }),
      jobLaunchedRecord(OWN_BUILD_JOB_ID, { kind: 'build', ticketIds: ['002'], target: mainLine }),
      builtEnded,
      jobLaunchedRecord('J5', { kind: 'merge', ticketIds: ['001'], target: mainLine }),
      jobEndedRecord('J5', 'landed', landedCommit),
    ];
    return { mainLine, landing };
  }

  test('a job whose own target another ticket\'s landing moved, that ticket\'s branch kept at the landing, passes as builder and as reviewer', () => {
    const { mainLine, landing } = landAnotherTicketOnTheOwnTarget();
    expect(refusal('V14', buildJobAcross(landing))).toBeNull();
    expect(refusal('V14', { ...buildJobAcross(landing), role: 'reviewer' })).toBeNull();
    expect(refusal('V14', buildJobAcross([]))?.facts).toEqual([`refs/heads/${mainLine}`, 'refs/heads/ticket-001']);
  });

  test('beside that landing, another protected ref moving, or the own target moving past the landed commit, still refuses', () => {
    const { mainLine, landing } = landAnotherTicketOnTheOwnTarget();
    const ownTip = headCommit();
    fakeGit.outputOf(repositoryDirectory, ['branch', '-f', 'example-protected', ownTip]);
    expect(refusal('V14', buildJobAcross(landing))).toEqual({ reason: 'foreign-ref-moved', facts: ['refs/heads/example-protected'] });
    fakeGit.outputOf(repositoryDirectory, ['branch', '-f', 'example-protected', startCommit]);
    fakeGit.outputOf(repositoryDirectory, ['branch', '-f', mainLine, ownTip]);
    expect(refusal('V14', buildJobAcross(landing))).toEqual({ reason: 'foreign-ref-moved', facts: [`refs/heads/${mainLine}`] });
  });

  test('a job deleting another ticket\'s branch still refuses, even beside a recorded group release', () => {
    fakeGit.outputOf(repositoryDirectory, ['branch', 'ticket-021', startCommit]);
    fakeGit.outputOf(repositoryDirectory, ['branch', 'group-example', startCommit]);
    launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? launchSnapshot;
    fakeGit.outputOf(repositoryDirectory, ['branch', '-D', 'ticket-021', 'group-example']);
    const release = [jobLaunchedRecord('M1', { kind: 'merge', ticketIds: ['378'], target: 'example-main' }), jobEndedRecord('M1', 'landed', startCommit)];
    expect(refusal('V14', buildJobAcross(release))).toEqual({ reason: 'foreign-ref-moved', facts: ['refs/heads/ticket-021'] });
  });
});
