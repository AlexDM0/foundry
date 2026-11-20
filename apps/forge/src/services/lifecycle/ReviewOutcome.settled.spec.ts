/**
 * A verified and gated review pass settled by code on recorded git scenarios and a Board in memory. What matters: the rework
 * is counted from the review's start, the `## Review <round>` and the record are code's, a pass that changed nothing is committed by code,
 * and each outcome makes its one move: a failed claim back to a fixer, a granted round to a fresh reviewer the policy launches, a refused
 * round to the merge queue with its notice, and a waiver proposal to User. User's answer is only recorded, as it is with the Overseer down;
 * the Overseer's next pass acts on it: a grant writes the waived item and a refusal is a failed pass. A grant whose
 * stored proposals are gone, cut short or of another shape waives nothing and fails closed as a failed pass. The board's
 * pipeline sets the rework threshold: a review with no re-review grants no round at any rework, and its `thresholdLines` is honoured.
 * Each branch state is a scenario `src/lib/git/RecordedGitScenarios.integration.spec.ts` records with real git; a call
 * it did not record fails the case, so the commit a pass makes is answered only with the message the recording holds.
 */

import { rmSync, writeFileSync } from 'node:fs';
import { join }                  from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { LogRecord }                                   from '../../lib/tracker-model/@types/LogRecord.ts';
import type { ConditionalReReview }                         from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording }              from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { Ticket }                                      from '../../lib/tracker-model/@types/Ticket.ts';
import type { TrackerProgress }                             from '../../lib/tracker-model/@types/TrackerProgress.ts';
import { Board }                                            from '../../lib/tracker-model/Board.ts';
import { createLogger }                                     from '../../lib/tracker-model/Logger.ts';
import { LIFECYCLE_LIMITS }                                 from '../../shared/constants/LifecycleLimits.ts';
import { useRecordedGit }                                   from '../../testing/RecordedGit.ts';
import { GIT_SCENARIOS }                                    from '../../testing/RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory }   from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded, testWhenGitIsRecorded } from '../../testing/ToolGuard.ts';
import { ReviewOutcome, type ReviewPassRequest }            from './ReviewOutcome.ts';

const AT = '2026-10-28T10:00:00+01:00';
const TICKET_BODY = '## Report\nExample report.\n\n## Acceptance\nA1. The example page loads.\nA2. The example export\n   names every role.\n\n## Brief\nExample brief.\n';
const OVER_THRESHOLD_LINES = LIFECYCLE_LIMITS.REWORK_ROUND_THRESHOLD_LINES + 50;

const WORDING: DecisionWording = {
  questions: [{
    question: 'Waive the proposed items?', header: 'waiver', multiSelect: false, options: []
  }],
  context: '',
};

/** Each commit a scenario names, as the replay fills it in, and the trees the gate judged, which no git call reads. */
const REVIEW_START = '1'.repeat(40);
const FIX_COMMIT = '2'.repeat(40);
const SECOND_FIX_COMMIT = '3'.repeat(40);
const COMMITTED_BY_CODE = '4'.repeat(40);
const GATED_TREE = 'a'.repeat(40);
const TREE_AFTER_THE_GATE = 'b'.repeat(40);

const { enterScenario } = useRecordedGit();

let repositoryDirectory = '';
let jobFolder = '';
const target = 'main';
let reviewStartCommit = '';
let headCommit = '';
let logRecords: LogRecord[] = [];
let board: Board;

/** Enters the scenario of the branch, its HEAD at `head`. */
function branchAt(scenario: string, head: string): void {
  headCommit = head;
  enterScenario(scenario, {
    repositoryDirectory,
    commits: {
      '<review start>': REVIEW_START, '<fix>': FIX_COMMIT, '<second fix>': SECOND_FIX_COMMIT, '<committed>': COMMITTED_BY_CODE
    },
  });
}

const DEFAULT_RE_REVIEW: ConditionalReReview = { thresholdLines: LIFECYCLE_LIMITS.REWORK_ROUND_THRESHOLD_LINES };

function newBoard(
  storedLogRecords: readonly LogRecord[] = [], storedBody = TICKET_BODY, reReview: ConditionalReReview | null = DEFAULT_RE_REVIEW
): Board {
  const progress: TrackerProgress = {
    trackerId:        'example-review',
    project:          'Example Agency',
    startedAt:        AT,
    view:             { kind: 'auto' },
    nextTaskId:       1,
    concurrencyLimit: 2,
    overseerState:    'running',
    tasks:            [],
  };
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
    body: storedBody,
  };
  return new Board({
    progress,
    tickets:  [ticket],
    epics:    [],
    logger:   createLogger((record) => logRecords.push(record)),
    storedLogRecords,
    pipeline: {
      version: 3,
      prepare: [],
      gates:   [{ name: 'verify', run: 'bun run verify' }],
      phases:  { build: ['verify'], review: ['verify'], merge: ['verify'] },
      review:  { name: 'Review', ...(reReview === null ? {} : { reReview }) },
    },
  });
}

/** A review job of the round, standing in `gating` with its review bar, as the Overseer leaves it once the gate passed. */
function reviewJobAtRound(round: number): string {
  const launched = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: round, target
  }, AT);
  const jobId = launched.job.id;
  board.startReviewBar('001', { round, owner: jobId }, AT);
  for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(jobId, state, AT);
  return jobId;
}

function claim(item: string, result: string, note = ''): Record<string, unknown> {
  return {
    item, result, handoffContradicted: false, note
  };
}

function report(claims: readonly Record<string, unknown>[], findings: readonly Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    role: 'reviewer', headCommit, claims, findings, reviewText: 'Example review by Alex Example.'
  };
}

function settle(jobId: string, reviewerReport: Record<string, unknown>) {
  const job = board.jobById(jobId);
  if (job === undefined) throw new Error(`job ${jobId} is not on the board`);
  const request: ReviewPassRequest = {
    board,
    at:                AT,
    job,
    report:            reviewerReport,
    worktreePath:      repositoryDirectory,
    reviewStartCommit,
    headTree:          GATED_TREE,
    jobFolder,
    limits:            LIFECYCLE_LIMITS,
    decisionWordingOf: (_draft: DecisionDraft) => WORDING,
  };
  // As the Overseer's hold does once the gate passed on the tree.
  board.recordPipelineJudgedBy('001', GATED_TREE, board.gateRunStampOf('review'), AT);
  return ReviewOutcome.settleReviewPass(request);
}

function ticketBody(): string {
  return board.tickets()[0]?.body ?? '';
}

function recordsOfKind<Kind extends LogRecord['kind']>(kind: Kind): Extract<LogRecord, { kind: Kind }>[] {
  return logRecords.filter((record): record is Extract<LogRecord, { kind: Kind }> => record.kind === kind);
}

function followThePlaybook(): ReturnType<Board['followPlaybook']> {
  return board.followPlaybook({ ...LIFECYCLE_LIMITS, now: AT, usageResetsAt: null }, {
    mainLine:                     target,
    groupTargetPrefix:            'group-',
    installVersionChanged:        false,
    ticketIdsTouchingAgentConfig: [],
    closedDeliveryTurns:          [],
    budgetSpentDeliveryTurns:     [],
    assistantHasAnswered:         false,
    assistantBootRetryDue:        false,
  }, () => WORDING);
}

/** User's answer is recorded as `decide` records it; the Overseer's next pass acts on each answer its Playbook names, on `headTree`. */
function answerTheWaiver(answer: string, headTree: string): void {
  const [decision] = board.decisions();
  board.answerDecision(decision?.id ?? '', [answer], AT);
  for (const step of followThePlaybook().steps) {
    if (step.kind === 'act-on-waiver-answer') ReviewOutcome.actOnWaiverAnswer(board, step.jobId, step.answers, jobFolder, headTree, AT);
  }
}

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('review-outcome');
  jobFolder = createScratchDirectory('review-job');
  reviewStartCommit = REVIEW_START;
  branchAt(GIT_SCENARIOS.REVIEW_WITHOUT_CHANGES, REVIEW_START);
  logRecords = [];
  board = newBoard();
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
  removeScratchDirectory(jobFolder);
});

describeWhenGitIsRecorded('a review pass settled by code', () => {
  test('a pass that changed nothing is committed by code, written as its Review, recorded, and queued to merge on its target', () => {
    const jobId = reviewJobAtRound(1);
    const outcome = settle(jobId, report([claim('A1', 'holds'), claim('A2', 'holds')]));

    expect(outcome.move).toBe('merge-queued');
    expect(outcome.headCommit).toBe(COMMITTED_BY_CODE);
    expect(outcome.reworkedLines).toBe(0);
    expect(ticketBody()).toContain('## Review 1\n\nExample review by Alex Example.\n\n- A1 holds\n- A2 holds\n');
    expect(recordsOfKind('review-recorded').map((record) => record.fields.verdict)).toEqual(['released']);
    expect(board.ticketIsMergeQueued('001')).toBe(true);
    expect(recordsOfKind('merge-queued').map((record) => [record.ticketId, record.fields.target])).toEqual([['001', target]]);
    expect(recordsOfKind('job-ended').map((record) => record.fields.outcome)).toEqual(['reviewed']);
    expect(board.jobs()).toEqual([]);
  });

  test('rework is counted from the review start with code lines only, and a fixed finding and a filed one are recorded as stored', () => {
    const fixCommit = FIX_COMMIT;
    branchAt(GIT_SCENARIOS.REVIEW_WITH_A_FIX, fixCommit);
    board = newBoard([
      {
        at:       AT,
        kind:     'ticket-filed',
        ticketId: '014',
        fields:   {
          title: 'Example finding', status: 'draft', priority: 'low', filedByJob: 'J1'
        }
      },
      {
        at: AT, kind: 'hatch-applied', jobId: 'J1', fields: { requestId: 'R3', commandKind: 'ticket-add', outcome: 'applied' }
      },
    ]);
    const jobId = reviewJobAtRound(1);
    const finding = {
      class: 'correctness', severity: 'quality', file: 'fix.ts', summary: 'Example', evidence: 'watched-fail'
    };
    const outcome = settle(jobId, report([claim('A1', 'holds'), claim('A2', 'holds')], [
      { ...finding, outcome: 'fixed', commit: fixCommit },
      {
        ...finding, class: 'out-of-scope', outcome: 'filed', filedTicketId: null, hatchRequestId: 'R3'
      },
    ]));

    expect(outcome.reworkedLines).toBe(1);
    expect(recordsOfKind('review-recorded')[0]?.fields.findings.map((recorded) => recorded.outcome === 'fixed' ? recorded.commit : recorded.filedTicketId))
      .toEqual([fixCommit, '014']);
    expect(recordsOfKind('review-recorded')[0]?.fields).toMatchObject({ reviewStartCommit, totalReworkedCodeLines: 1, rebaseReworkedCodeLines: 0 });
  });

  test('a claim that does not hold is a failed pass back to a fixer: the job ends does-not-hold and the ticket goes back in progress', () => {
    const jobId = reviewJobAtRound(1);
    expect(settle(jobId, report([claim('A1', 'holds'), claim('A2', 'does-not-hold')])).move).toBe('fixer');
    expect(recordsOfKind('job-ended').map((record) => record.fields.outcome)).toEqual(['does-not-hold']);
    expect(board.tickets()[0]?.frontmatter.status).toBe('in-progress');
    expect(board.ticketIsMergeQueued('001')).toBe(false);
  });

  test('over-threshold rework with a granted round ends round-granted, and the policy launches a fresh re-reviewer one round on', () => {
    branchAt(GIT_SCENARIOS.REVIEW_WITH_MANY_REWORKED_LINES, FIX_COMMIT);
    const jobId = reviewJobAtRound(1);
    const outcome = settle(jobId, report([claim('A1', 'holds'), claim('A2', 'holds')]));

    expect(outcome).toMatchObject({ move: 'fresh-reviewer', reworkedLines: OVER_THRESHOLD_LINES });
    expect(recordsOfKind('job-ended').map((record) => record.fields.outcome)).toEqual(['round-granted']);
    const advanced = board.followPlaybook({ ...LIFECYCLE_LIMITS, now: AT, usageResetsAt: null }, {
      mainLine:                     target,
      groupTargetPrefix:            'group-',
      installVersionChanged:        false,
      ticketIdsTouchingAgentConfig: [],
      closedDeliveryTurns:          [],
      budgetSpentDeliveryTurns:     [],
      assistantHasAnswered:         false,
      assistantBootRetryDue:        false,
    }, () => WORDING);
    expect(advanced.steps.filter((step) => step.kind === 'launch-review')).toEqual([{
      kind: 'launch-review', ticketId: '001', round: 2, target
    }]);
    expect(board.jobs().find((job) => job.kind === 'review')?.id).not.toBe(jobId);
    expect(board.jobs().find((job) => job.kind === 'review')).toMatchObject({ role: 're-reviewer', attempt: 2 });
  });

  test('over-threshold rework refused another round for non-convergence passes on to the merge queue and shows rounds-not-converging', () => {
    const findingInANewFile = {
      class: 'correctness', severity: 'quality', file: 'example-new.ts', summary: 'Example', evidence: 'reading', outcome: 'fixed'
    };
    const firstFix = FIX_COMMIT;
    branchAt(GIT_SCENARIOS.REVIEW_WITH_AN_OLD_FILE_FIX, firstFix);
    settle(reviewJobAtRound(1), report([claim('A1', 'holds'), claim('A2', 'holds')], [{ ...findingInANewFile, file: 'example-old.ts', commit: firstFix }]));
    board.setTicketMergeQueued('001', false, AT);
    reviewStartCommit = firstFix;
    const secondFix = SECOND_FIX_COMMIT;
    branchAt(GIT_SCENARIOS.SECOND_REVIEW_WITH_A_NEW_FILE, secondFix);
    const outcome = settle(reviewJobAtRound(2), report([claim('A1', 'holds'), claim('A2', 'holds')], [{ ...findingInANewFile, commit: secondFix }]));

    expect(outcome.move).toBe('merge-queued');
    expect(ReviewOutcome.nonConvergingTicketIdsOf(logRecords, (record) => ReviewOutcome.recordedReviewPipelineOf(board, record), LIFECYCLE_LIMITS)).toEqual(['001']);
  });

  test('a failed pass over the threshold takes no round verdict, so it shows no rounds-not-converging', () => {
    branchAt(GIT_SCENARIOS.REVIEW_WITH_MANY_REWORKED_LINES, FIX_COMMIT);
    const outcome = settle(reviewJobAtRound(1), report([claim('A1', 'holds'), claim('A2', 'does-not-hold')]));

    expect(outcome).toMatchObject({ move: 'fixer', reworkedLines: OVER_THRESHOLD_LINES });
    expect(ReviewOutcome.nonConvergingTicketIdsOf(logRecords, (record) => ReviewOutcome.recordedReviewPipelineOf(board, record), LIFECYCLE_LIMITS)).toEqual([]);
  });

  test('a review with no re-review grants no round at any rework: the pass queues to merge and shows no rounds-not-converging', () => {
    branchAt(GIT_SCENARIOS.REVIEW_WITH_MANY_REWORKED_LINES, FIX_COMMIT);
    board = newBoard([], TICKET_BODY, null);
    const outcome = settle(reviewJobAtRound(1), report([claim('A1', 'holds'), claim('A2', 'holds')]));

    expect(outcome).toMatchObject({ move: 'merge-queued', reworkedLines: OVER_THRESHOLD_LINES });
    expect(recordsOfKind('job-ended').map((record) => record.fields.outcome)).toEqual(['reviewed']);
    expect(ReviewOutcome.nonConvergingTicketIdsOf(logRecords, (record) => ReviewOutcome.recordedReviewPipelineOf(board, record), LIFECYCLE_LIMITS)).toEqual([]);
  });

  test('the re-review threshold of the pipeline is honoured: rework of exactly its lines is refused a round', () => {
    branchAt(GIT_SCENARIOS.REVIEW_WITH_MANY_REWORKED_LINES, FIX_COMMIT);
    board = newBoard([], TICKET_BODY, { thresholdLines: OVER_THRESHOLD_LINES });
    const outcome = settle(reviewJobAtRound(1), report([claim('A1', 'holds'), claim('A2', 'holds')]));

    expect(outcome).toMatchObject({ move: 'merge-queued', reworkedLines: OVER_THRESHOLD_LINES });
    expect(ReviewOutcome.nonConvergingTicketIdsOf(logRecords, (record) => ReviewOutcome.recordedReviewPipelineOf(board, record), LIFECYCLE_LIMITS)).toEqual([]);
  });

  test('a waiver proposal opens a waiver decision, keeps the ticket out of the merge queue and holds every launch on it', () => {
    board.setTicketMergeQueued('001', true, AT);
    const jobId = reviewJobAtRound(1);
    expect(settle(jobId, report([claim('A1', 'holds'), claim('A2', 'waiver-proposed', 'The export was retired')])).move).toBe('waiver');

    expect(board.decisions().map((decision) => [decision.kind, decision.ticketIds, decision.jobId])).toEqual([['waiver', ['001'], jobId]]);
    expect(board.ticketIsMergeQueued('001')).toBe(false);
    expect(board.jobById(jobId)?.state).toBe('awaiting-answer');
    board.endJob(jobId, { outcome: 'stopped' }, AT);
    expect(followThePlaybook().steps.filter((step) => step.kind === 'launch-review')).toEqual([]);
  });

  test('the answer alone moves nothing; the next pass names the waiting review with the answer to act on', () => {
    const jobId = reviewJobAtRound(1);
    settle(jobId, report([claim('A1', 'holds'), claim('A2', 'waiver-proposed', 'The export was retired')]));
    expect(followThePlaybook().steps.filter((step) => step.kind === 'act-on-waiver-answer')).toEqual([]);
    const [decision] = board.decisions();
    board.answerDecision(decision?.id ?? '', ['Grant'], AT);

    expect(board.jobById(jobId)?.state).toBe('awaiting-answer');
    expect(board.ticketIsMergeQueued('001')).toBe(false);
    expect(followThePlaybook().steps.filter((step) => step.kind === 'act-on-waiver-answer')).toEqual([{ kind: 'act-on-waiver-answer', jobId, answers: ['Grant'] }]);
  });

  test('granting the waiver writes the item waived in the pass after the answer and queues the ticket to merge', () => {
    const jobId = reviewJobAtRound(1);
    settle(jobId, report([claim('A1', 'holds'), claim('A2', 'waiver-proposed', 'The export was retired')]));
    answerTheWaiver('Grant', GATED_TREE);

    expect(ticketBody()).toContain('## Acceptance\nA1. The example page loads.\nA2. Waived: The export was retired\n\n## Brief\n');
    expect(board.decisions()).toEqual([]);
    expect(board.ticketIsMergeQueued('001')).toBe(true);
    expect(recordsOfKind('job-ended').map((record) => record.fields.outcome)).toEqual(['reviewed']);
  });

  test('granting the waiver on a tree the gates did not pass ends the review but queues nothing, so a fresh review gates it', () => {
    const jobId = reviewJobAtRound(1);
    settle(jobId, report([claim('A1', 'holds'), claim('A2', 'waiver-proposed', 'The export was retired')]));
    // A commit after the gate, which changes the tree the waiver is answered on.
    answerTheWaiver('Grant', TREE_AFTER_THE_GATE);

    expect(recordsOfKind('job-ended').map((record) => record.fields.outcome)).toEqual(['reviewed']);
    expect(board.ticketIsMergeQueued('001')).toBe(false);
    expect(recordsOfKind('merge-queued')).toEqual([]);
  });

  test('refusing the waiver is a failed pass back to a fixer', () => {
    const jobId = reviewJobAtRound(1);
    settle(jobId, report([claim('A1', 'holds'), claim('A2', 'waiver-proposed', 'The export was retired')]));
    answerTheWaiver('Refuse: the export stays', GATED_TREE);

    expect(ticketBody()).not.toContain('Waived:');
    expect(recordsOfKind('job-ended').map((record) => [record.fields.outcome, record.fields.cause])).toEqual([['does-not-hold', 'waiver-refused']]);
    expect(board.tickets()[0]?.frontmatter.status).toBe('in-progress');
    expect(board.ticketIsMergeQueued('001')).toBe(false);
  });

  for (const [form, storedProposals] of [
    ['cut short', '[{"item": "A2", "rea'],
    ['valid JSON but no list', '{"item": "A2", "reason": "The export was retired"}'],
    ['a list of the wrong shape', '[{"item": 2}]'],
    ['an empty list', '[]'],
  ] as const) {
    test(`granting the waiver when its stored proposals are ${form} waives nothing and fails closed back to a fixer`, () => {
      const jobId = reviewJobAtRound(1);
      settle(jobId, report([claim('A1', 'holds'), claim('A2', 'waiver-proposed', 'The export was retired')]));
      writeFileSync(join(jobFolder, 'waiver-proposals.json'), storedProposals);
      answerTheWaiver('Grant', GATED_TREE);

      expect(ticketBody()).not.toContain('Waived:');
      expect(recordsOfKind('job-ended').map((record) => [record.fields.outcome, record.fields.cause]))
        .toEqual([['does-not-hold', 'waiver-proposals-unreadable']]);
      expect(board.tickets()[0]?.frontmatter.status).toBe('in-progress');
      expect(board.ticketIsMergeQueued('001')).toBe(false);
    });
  }

  test('granting the waiver when its proposals file is gone waives nothing and fails closed back to a fixer', () => {
    const jobId = reviewJobAtRound(1);
    settle(jobId, report([claim('A1', 'holds'), claim('A2', 'waiver-proposed', 'The export was retired')]));
    rmSync(join(jobFolder, 'waiver-proposals.json'));
    answerTheWaiver('Grant', GATED_TREE);

    expect(recordsOfKind('job-ended').map((record) => record.fields.cause)).toEqual(['waiver-proposals-unreadable']);
    expect(board.ticketIsMergeQueued('001')).toBe(false);
  });
});

testWhenGitIsRecorded('the waived line replaces the item and its continuation lines, leaving the other items as written', () => {
  expect(ReviewOutcome.bodyWithWaivedItems(TICKET_BODY, [{ item: 'A2', reason: 'Example reason' }]))
    .toBe('## Report\nExample report.\n\n## Acceptance\nA1. The example page loads.\nA2. Waived: Example reason\n\n## Brief\nExample brief.\n');
});

testWhenGitIsRecorded('a CRLF body gets its waived line and keeps CRLF on every line', () => {
  expect(ReviewOutcome.bodyWithWaivedItems(TICKET_BODY.replaceAll('\n', '\r\n'), [{ item: 'A2', reason: 'Example reason' }]))
    .toBe('## Report\r\nExample report.\r\n\r\n## Acceptance\r\nA1. The example page loads.\r\nA2. Waived: Example reason\r\n\r\n## Brief\r\nExample brief.\r\n');
});

describeWhenGitIsRecorded('a waiver on a CRLF ticket', () => {
  test('granting it writes the waived item in CRLF', () => {
    board = newBoard([], TICKET_BODY.replaceAll('\n', '\r\n'));
    const jobId = reviewJobAtRound(1);
    settle(jobId, report([claim('A1', 'holds'), claim('A2', 'waiver-proposed', 'The export was retired')]));
    answerTheWaiver('Grant', GATED_TREE);

    expect(ticketBody()).toContain('## Acceptance\r\nA1. The example page loads.\r\nA2. Waived: The export was retired\r\n\r\n## Brief\r\n');
    expect(ticketBody().replaceAll('\r\n', '')).not.toContain('\n');
  });
});
