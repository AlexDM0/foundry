/**
 * The commit a review pass that changed nothing writes, against a mocked git. What matters is that the commit and the read of its HEAD
 * run with the worktree's parent as their ceiling: a worktree that lost its `.git` then refuses, and the commit never lands on the main
 * checkout's branch above it.
 */
import {
  afterEach,
  beforeEach,
  expect,
  spyOn,
  test
} from 'bun:test';
import { GitProcess, type GitHookPolicy, type GitRun } from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                from '../../lib/git/GitWorktrees.ts';
import type { DecisionWording }                        from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { Ticket }                                 from '../../lib/tracker-model/@types/Ticket.ts';
import type { TrackerProgress }                        from '../../lib/tracker-model/@types/TrackerProgress.ts';
import { Board }                                       from '../../lib/tracker-model/Board.ts';
import { createLogger }                                from '../../lib/tracker-model/Logger.ts';
import { LIFECYCLE_LIMITS }                            from '../../shared/constants/LifecycleLimits.ts';
import { ReviewOutcome }                               from './ReviewOutcome.ts';

const AT = '2026-10-28T10:00:00+01:00';
const WORKTREE_PATH = '/example-agency/.claude/worktrees/ticket-001';
const REVIEW_START_COMMIT = 'a'.repeat(40);
const NO_CHANGES_COMMIT = 'b'.repeat(40);
const WORDING: DecisionWording = { questions: [], context: '' };

interface RecordedGitCall {
  gitArguments:     readonly string[];
  ceilingDirectory: string | undefined;
}

let recordedRuns: RecordedGitCall[] = [];
let recordedCommitReads: RecordedGitCall[] = [];

function newBoard(): Board {
  const progress: TrackerProgress = {
    trackerId: 'example-review', project: 'Example Agency', startedAt: AT, view: { kind: 'auto' }, nextTaskId: 1, concurrencyLimit: 2, overseerState: 'running', tasks: [],
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
    body:     '## Acceptance\nA1. The example page loads.\n',
    filePath: '/example-agency/.agent-progress/tickets/001-example.md',
  };
  return new Board({
    progress,
    tickets:          [ticket],
    epics:            [],
    logger:           createLogger(() => undefined),
    storedLogRecords: [],
    pipeline:         { prepare: [], gates: [{ name: 'verify', run: 'bun run verify' }], review: { name: 'Review' } },
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
  const outcome = ReviewOutcome.settleReviewPass({
    board,
    at:     AT,
    job:    launched.job,
    report: {
      role: 'reviewer', headCommit: REVIEW_START_COMMIT, claims: [], findings: [], reviewText: 'Example review by Alex Example.'
    },
    worktreePath:      WORKTREE_PATH,
    reviewStartCommit: REVIEW_START_COMMIT,
    jobFolder:         '/example-agency/.agent-progress/jobs/example',
    limits:            LIFECYCLE_LIMITS,
    decisionWordingOf: () => WORDING,
  });
  const commit = recordedRuns.find((call) => call.gitArguments[0] === 'commit');
  expect(commit).toMatchObject({ gitArguments: expect.arrayContaining(['--allow-empty']), ceilingDirectory: GitWorktrees.ceilingOf(WORKTREE_PATH) });
  expect(recordedCommitReads).toContainEqual({ gitArguments: ['HEAD'], ceilingDirectory: GitWorktrees.ceilingOf(WORKTREE_PATH) });
  expect(outcome.headCommit).toBe(NO_CHANGES_COMMIT);
});
