/**
 * The commit a review pass that changed nothing writes, against a mocked git: it runs with the worktree's parent as its ceiling, so it never lands
 * on the main checkout's branch; a pass whose pipeline changed since its gate run queues nothing, its green not current; and with merge approval on,
 * a passing review waits unqueued in `merging-main` for the merge of the target.
 */
import {
  afterEach,
  beforeEach,
  expect,
  spyOn,
  test
} from 'bun:test';
import type { DecisionWording }                        from '../../domain/tracker-model/@types/PlaybookStep.ts';
import type { Ticket }                                 from '../../domain/tracker-model/@types/Ticket.ts';
import type { TrackerProgress }                        from '../../domain/tracker-model/@types/TrackerProgress.ts';
import { Board }                                       from '../../domain/tracker-model/Board.ts';
import { createLogger }                                from '../../domain/tracker-model/Logger.ts';
import { GitProcess, type GitHookPolicy, type GitRun } from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                from '../../lib/git/GitWorktrees.ts';
import { LIFECYCLE_LIMITS }                            from '../../shared/constants/LifecycleLimits.ts';
import { ReviewOutcome }                               from './ReviewOutcome.ts';

const AT = '2026-10-28T10:00:00+01:00';
const WORKTREE_PATH = '/example-agency/.claude/worktrees/ticket-001';
const REVIEW_START_COMMIT = 'a'.repeat(40);
const NO_CHANGES_COMMIT = 'b'.repeat(40);
const EXAMPLE_TREE = 'c'.repeat(40);
const WORDING: DecisionWording = { questions: [], context: '' };

interface RecordedGitCall {
  gitArguments:     readonly string[];
  ceilingDirectory: string | undefined;
}

let recordedRuns: RecordedGitCall[] = [];
let recordedCommitReads: RecordedGitCall[] = [];

function newBoard(): Board {
  const progress: TrackerProgress = {
    trackerId: 'example-review', project: 'Example Agency', startedAt: AT, view: { kind: 'auto' }, nextTaskId: 1, concurrencyLimit: 2, hephaestusState: 'running', tasks: [],
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
    body: '## Acceptance\nA1. The example page loads.\n',
  };
  return new Board({
    progress,
    tickets:          [ticket],
    epics:            [],
    logger:           createLogger(() => undefined),
    storedLogRecords: [],
    pipeline:         {
      version: 5, prepare: [], gates: [{ name: 'verify', run: 'bun run verify' }], phases: { build: ['verify'], review: ['verify'], merge: ['verify'] }, review: { name: 'Review' }
    },
  });
}

beforeEach(() => {
  recordedRuns = [];
  recordedCommitReads = [];
  spyOn(GitProcess, 'run').mockImplementation(
    (_directory: string, gitArguments: readonly string[], _hookPolicy?: GitHookPolicy, _standardInput?: string, ceilingDirectory?: string): GitRun => {
      recordedRuns.push({ gitArguments, ceilingDirectory });
      return { exitCode: 0, standardOutput: '', standardError: '' };
    }
  );
  spyOn(GitProcess, 'resolvedCommitOf').mockImplementation((_directory: string, revision: string, ceilingDirectory?: string): string => {
    recordedCommitReads.push({ gitArguments: [revision], ceilingDirectory });
    return NO_CHANGES_COMMIT;
  });
});

afterEach(() => {
  spyOn(GitProcess, 'run').mockRestore();
  spyOn(GitProcess, 'resolvedCommitOf').mockRestore();
});

test('a pass that changed nothing commits, and reads the commit back, with the worktree\'s parent as the ceiling', () => {
  const board = newBoard();
  const launched = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  board.startReviewBar('001', { round: 1, owner: launched.job.id }, AT);
  for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(launched.job.id, state, AT);
  board.recordPipelineJudgedBy('001', EXAMPLE_TREE, board.gateRunStampOf('review'), AT);
  const outcome = ReviewOutcome.settleReviewPass({
    board,
    at:     AT,
    job:    launched.job,
    report: {
      role: 'reviewer', headCommit: REVIEW_START_COMMIT, claims: [], findings: [], reviewText: 'Example review by Alex Example.'
    },
    worktreePath:      WORKTREE_PATH,
    reviewStartCommit: REVIEW_START_COMMIT,
    headTree:          EXAMPLE_TREE,
    jobFolder:         '/example-agency/.agent-progress/jobs/example',
    limits:            LIFECYCLE_LIMITS,
    decisionWordingOf: () => WORDING,
  });
  const commit = recordedRuns.find((call) => call.gitArguments[0] === 'commit');
  expect(commit).toMatchObject({ gitArguments: expect.arrayContaining(['--allow-empty']), ceilingDirectory: GitWorktrees.ceilingOf(WORKTREE_PATH) });
  expect(recordedCommitReads).toContainEqual({ gitArguments: ['HEAD'], ceilingDirectory: GitWorktrees.ceilingOf(WORKTREE_PATH) });
  expect(outcome.headCommit).toBe(NO_CHANGES_COMMIT);
});

test('a pass whose gate run read a pipeline changed since ends reviewed and waits unqueued, since its green is not current', () => {
  const board = newBoard();
  const launched = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  board.startReviewBar('001', { round: 1, owner: launched.job.id }, AT);
  for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(launched.job.id, state, AT);
  board.recordPipelineJudgedBy('001', EXAMPLE_TREE, { phase: 'review', phaseHash: 'example-hash-the-run-read' }, AT);
  const outcome = ReviewOutcome.settleReviewPass({
    board,
    at:     AT,
    job:    launched.job,
    report: {
      role: 'reviewer', headCommit: REVIEW_START_COMMIT, claims: [], findings: [], reviewText: 'Example review by Alex Example.'
    },
    worktreePath:      WORKTREE_PATH,
    reviewStartCommit: REVIEW_START_COMMIT,
    headTree:          EXAMPLE_TREE,
    jobFolder:         '/example-agency/.agent-progress/jobs/example',
    limits:            LIFECYCLE_LIMITS,
    decisionWordingOf: () => WORDING,
  });
  expect(outcome.move).toBe('merge-queued');
  expect(outcome.logged).toContainEqual(expect.objectContaining({ kind: 'job-ended', jobId: launched.job.id, fields: expect.objectContaining({ outcome: 'reviewed' }) }));
  expect(board.ticketIsMergeQueued('001')).toBe(false);
});

test('with merge approval on, a passing review records its review and waits in merging-main, neither ended nor queued', () => {
  const board = newBoard();
  board.setApproval('merge', true, AT);
  const launched = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  board.startReviewBar('001', { round: 1, owner: launched.job.id }, AT);
  for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(launched.job.id, state, AT);
  board.recordPipelineJudgedBy('001', EXAMPLE_TREE, board.gateRunStampOf('review'), AT);
  const outcome = ReviewOutcome.settleReviewPass({
    board,
    at:     AT,
    job:    launched.job,
    report: {
      role: 'reviewer', headCommit: REVIEW_START_COMMIT, claims: [], findings: [], reviewText: 'Example review by Alex Example.'
    },
    worktreePath:      WORKTREE_PATH,
    reviewStartCommit: REVIEW_START_COMMIT,
    headTree:          EXAMPLE_TREE,
    jobFolder:         '/example-agency/.agent-progress/jobs/example',
    limits:            LIFECYCLE_LIMITS,
    decisionWordingOf: () => WORDING,
  });
  expect(outcome.move).toBe('merge-queued');
  expect(board.jobById(launched.job.id)?.state).toBe('merging-main');
  expect(outcome.logged.some((record) => record.kind === 'job-ended')).toBe(false);
  expect(outcome.logged).toContainEqual(expect.objectContaining({ kind: 'review-recorded', ticketId: '001' }));
  expect(board.ticketIsMergeQueued('001')).toBe(false);
});
