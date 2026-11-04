/**
 * Records the git scenarios `src/services/lifecycle/ReviewOutcome.settled.spec.ts` replays: each case builds a ticket branch with real git,
 * settles a review pass on it as the replaying spec does, and records every call the pass makes: the rework diff, the change size and, for a
 * pass that changed nothing, the commit code makes. `bun run record src/lib/git/GitProcess.ts` runs this spec.
 */
import { realpathSync } from 'node:fs';

import { afterAll, expect, test } from 'bun:test';

import type { LogRecord }                    from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Ticket }                       from '../../lib/tracker-model/@types/Ticket.ts';
import { Board }                             from '../../lib/tracker-model/Board.ts';
import { createLogger }                      from '../../lib/tracker-model/Logger.ts';
import { LIFECYCLE_LIMITS }                  from '../../shared/constants/LifecycleLimits.ts';
import { captureGitScenario, GIT_SCENARIOS } from '../../testing/RecordedGitScenarios.ts';
import {
  commitFile,
  createScratchDirectory,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory
} from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import { ReviewOutcome }            from './ReviewOutcome.ts';

const AT = '2026-10-28T10:00:00+01:00';
const TICKET_BODY = '## Report\nExample report.\n\n## Acceptance\nA1. The example page loads.\nA2. The example export\n   names every role.\n';
const TARGET = 'main';
const OVER_THRESHOLD_LINES = LIFECYCLE_LIMITS.REWORK_ROUND_THRESHOLD_LINES + 50;

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function newBoard(): Board {
  const ticket: Ticket = {
    frontmatter: {
      id:          '001',
      title:       'Example review ticket',
      type:        'ticket',
      status:      'in-review',
      filed:       AT,
      updated:     AT,
      started:     AT,
      finished:    AT,
      delivered:   null,
      abandonedAt: null,
      task:        null,
      extra:       [],
    },
    body:     TICKET_BODY,
    filePath: '/example-agency/.agent-progress/tickets/001-example.md',
  };
  const logRecords: LogRecord[] = [];
  return new Board({
    progress: {
      trackerId: 'example-review', project: 'Example Agency', startedAt: AT, view: { kind: 'auto' }, nextTaskId: 1, concurrencyLimit: 2, overseerState: 'running', tasks: [],
    },
    tickets:          [ticket],
    epics:            [],
    logger:           createLogger((record) => logRecords.push(record)),
    storedLogRecords: [],
    pipeline:         { prepare: [], gates: [{ name: 'verify', run: 'bun run verify' }], review: { name: 'Review' } },
  });
}

interface ReviewedBranch {
  directory:         string;
  reviewStartCommit: string;
}

/** main holding base.ts, ticket-001 off it with feature.ts committed, where the review starts. */
function reviewedBranch(): ReviewedBranch {
  const directory = realpathSync(createScratchGitRepository('review-outcome-scenarios'));
  scratchDirectories.push(directory);
  gitOutputIn(directory, ['branch', '-m', TARGET]);
  commitFile(directory, 'base.ts', 'export const base = true;\n');
  gitOutputIn(directory, ['checkout', '-q', '-b', 'ticket-001']);
  return { directory, reviewStartCommit: commitFile(directory, 'feature.ts', 'export const feature = true;\n') };
}

function manyCodeLines(): string {
  return `${Array.from({ length: OVER_THRESHOLD_LINES }, (_unused, i) => `export const exampleValue${i} = ${i};`).join('\n')}\n`;
}

/** Settles a pass of `round` reported at HEAD with the claims, recording its calls as `scenario`; the commit code makes is `<committed>`. */
function settledIn(scenario: string, branch: ReviewedBranch, commits: Record<string, string>, round: number, results: readonly string[]): void {
  const board = newBoard();
  const jobFolder = createScratchDirectory('review-outcome-job');
  scratchDirectories.push(jobFolder);
  const head = gitOutputIn(branch.directory, ['rev-parse', 'HEAD']);
  const launched = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: round, target: TARGET
  }, AT);
  board.startReviewBar('001', { round, owner: launched.job.id }, AT);
  for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(launched.job.id, state, AT);
  const job = board.jobById(launched.job.id);
  if (job === undefined) throw new Error('the review job is not on the board');
  const headTree = gitOutputIn(branch.directory, ['rev-parse', 'HEAD^{tree}']);
  board.recordPipelineJudgedBy('001', headTree, AT);
  const claims = results.map((result, i) => ({
    item: `A${i + 1}`, result, handoffContradicted: false, note: 'The export was retired'
  }));
  const values = { repositoryDirectory: branch.directory, commits: { '<review start>': branch.reviewStartCommit, ...commits } };
  const outcome = captureGitScenario(scenario, values, () => ReviewOutcome.settleReviewPass({
    board,
    at:     AT,
    job,
    report: {
      role: 'reviewer', headCommit: head, claims, findings: [], reviewText: 'Example review by Alex Example.'
    },
    worktreePath:      branch.directory,
    reviewStartCommit: branch.reviewStartCommit,
    headTree,
    jobFolder,
    limits:            LIFECYCLE_LIMITS,
    decisionWordingOf: () => ({
      questions: [{
        question: 'Waive the proposed items?', header: 'waiver', multiSelect: false, options: []
      }],
      context: '',
    }),
  }), () => {
    const committed = gitOutputIn(branch.directory, ['rev-parse', 'HEAD']);
    return committed === head ? {} : { '<committed>': committed };
  });
  expect(outcome.move).not.toBe('');
}

describeWhenGitIsPresent('the git scenarios the review outcome spec replays', () => {
  test.each([['holds', 'holds'], ['holds', 'does-not-hold'], ['holds', 'waiver-proposed']])('a pass that changed nothing, its claims %s and %s', (firstResult, secondResult) => {
    settledIn(GIT_SCENARIOS.REVIEW_WITHOUT_CHANGES, reviewedBranch(), {}, 1, [firstResult, secondResult]);
  });

  test('a pass with a fix committed', () => {
    const branch = reviewedBranch();
    const fix = commitFile(branch.directory, 'fix.ts', '// An example comment.\nexport const fixed = true;\n');
    settledIn(GIT_SCENARIOS.REVIEW_WITH_A_FIX, branch, { '<fix>': fix }, 1, ['holds', 'holds']);
  });

  test.each([['holds'], ['does-not-hold']])('a pass with many reworked lines, its second claim %s', (secondResult) => {
    const branch = reviewedBranch();
    const fix = commitFile(branch.directory, 'rework.ts', manyCodeLines());
    settledIn(GIT_SCENARIOS.REVIEW_WITH_MANY_REWORKED_LINES, branch, { '<fix>': fix }, 1, ['holds', secondResult]);
  });

  test('a pass with an old file fixed, then a second pass adding a new file of many lines', () => {
    const branch = reviewedBranch();
    const fix = commitFile(branch.directory, 'example-old.ts', 'export const old = true;\n');
    settledIn(GIT_SCENARIOS.REVIEW_WITH_AN_OLD_FILE_FIX, branch, { '<fix>': fix }, 1, ['holds', 'holds']);
    const secondFix = commitFile(branch.directory, 'example-new.ts', manyCodeLines());
    const commits = { '<review start>': branch.reviewStartCommit, '<fix>': fix, '<second fix>': secondFix };
    settledIn(GIT_SCENARIOS.SECOND_REVIEW_WITH_A_NEW_FILE, { ...branch, reviewStartCommit: fix }, commits, 2, ['holds', 'holds']);
  });
});
