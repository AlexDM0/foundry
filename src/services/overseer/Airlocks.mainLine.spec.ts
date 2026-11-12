/**
 * The main line's Airlock (design section 6). What matters: candidates land one at a time in queue order, each on its gated merged tree
 * and by fast-forward alone; the merged tree runs the merge phase's gates, skipped only for a green current in that phase, and a stale green
 * is gated again in the phase it was taken in; a moved target, a dirty checkout and a refused stamp each map to one outcome that cannot
 * loop; and a job in landing whose commit the main line holds finishes. `Airlocks.conflicts.spec.ts` holds a conflict and a slot left
 * mid-merge, and `Airlocks.spec.ts` a group's slot. The folders are real; git answers from the recorded answer sets of
 * `src/services/overseer/testing/AirlockAnswerSets.ts`, one for each state of the repository, and a by-hand move of a branch is the
 * case entering the set of the state it leaves.
 */
import { existsSync, rmSync } from 'node:fs';
import { join }               from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { LIFECYCLE_LIMITS } from '../../shared/constants/LifecycleLimits.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  useRecordedGit,
  type RecordedGitStage
} from '../../testing/RecordedGit.ts';
import {
  AirlockAnswerSets,
  MOVED_AIRLOCK_IDS,
  type MainLineAnswers,
  type MainLineLanding
} from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness,
  type HarnessTicket
} from './testing/AirlocksHarness.ts';

const recordedGit = useRecordedGit();

const {
  MAIN_TIP, TICKET_TIP, MERGED_TIP, TICKET_TREE, MERGED_TREE
} = RECORDED_AIRLOCK_IDS;
const {
  MOVED_MAIN_TIP, SECOND_MOVED_MAIN_TIP, MOVED_BRANCH_TIP, SECOND_TICKET_TIP, MOVED_BRANCH_TREE, OTHER_TREE
} = MOVED_AIRLOCK_IDS;

const CHECKOUT_TICKET: HarnessTicket = { id: '001' };

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function kindsLogged(current: AirlocksHarness, kind: string): Record<string, unknown>[] {
  return current.board.logRecordsSoFar().filter((record) => record.kind === kind).map((record) => record as unknown as Record<string, unknown>);
}

function answersOf(current: AirlocksHarness, landing: Partial<MainLineLanding> = {}): MainLineAnswers {
  return AirlockAnswerSets.mainLineAnswersOf({
    ticketId: '001', repository: current.repository, worktree: current.worktreeOf('001'), ...landing
  });
}

/** A harness of ticket #001 whose git answers from the main-line sets of `landing`, before any merge-in. */
function harnessAnswering(landing: Partial<MainLineLanding> = {}, ticket: HarnessTicket = CHECKOUT_TICKET, hasReviewPhase = true): AirlocksHarness {
  const current = createRecordedAirlocksHarness([ticket], {}, hasReviewPhase);
  recordedGit.answerFrom(answersOf(current, landing).beforeTheMergeIn);
  return current;
}

function callsAsked(gitArguments: readonly string[]): number {
  return recordedGit.flowCalls().filter((asked) => JSON.stringify(asked) === JSON.stringify(gitArguments)).length;
}

function fastForwardsAsked(): string[] {
  return recordedGit.flowCalls().filter((asked) => asked[0] === 'merge' && asked[1] === '--ff-only').map((asked) => asked.at(-1) ?? '');
}

function endingsOf(current: AirlocksHarness): (string | undefined)[] {
  return kindsLogged(current, 'job-ended').map((record) => (record['fields'] as { cause?: string }).cause);
}

describe('two clean candidates', () => {
  test('land in queue order, each gated on its merged tree, the main line moving only by fast-forward, with typed merge records', async () => {
    harness = createRecordedAirlocksHarness([
      { id: '002' },
      { id: '001' },
    ]);
    const current = harness;
    const secondCandidate = (mainTip: string): MainLineAnswers => answersOf(current, { branchTip: SECOND_TICKET_TIP, mainTip, holdsMainLine: false });
    const batchPrediction: RecordedGitStage = [{
      gitArguments: ['merge-tree', '--stdin', '--name-only', '--no-messages', '-z'],
      answeredAs:   GIT_CALL_SHAPES.BATCH_OF_ONE_CLEAN_PREDICTION,
      filledIn:     { [RECORDED_PLACEHOLDERS.TREE]: MERGED_TREE },
    }];
    const firstCandidate = AirlockAnswerSets.mainLineAnswersOf({
      ticketId: '002', repository: current.repository, worktree: current.worktreeOf('002'), afterLanding: secondCandidate(TICKET_TIP).beforeTheMergeIn,
    });
    recordedGit.answerFrom([...firstCandidate.beforeTheMergeIn, ...secondCandidate(MAIN_TIP).beforeTheMergeIn, ...batchPrediction]);

    expect(await current.slots.sweep()).toEqual([]);

    const landed = kindsLogged(current, 'merge-landed').map((record) => record['fields'] as { commit: string; kind: string });
    const started = kindsLogged(current, 'merge-started');
    expect(started.map((record) => (record['fields'] as { branchTip: string }).branchTip)).toEqual([TICKET_TIP, SECOND_TICKET_TIP]);
    expect(started[0]?.['fields']).toEqual({
      target: 'main', targetTip: MAIN_TIP, branchTip: TICKET_TIP, predictedConflictFiles: []
    });
    expect(started[1]?.['fields']).toMatchObject({ targetTip: TICKET_TIP });
    expect(landed).toEqual([expect.objectContaining({ kind: 'landed', commit: TICKET_TIP }), expect.objectContaining({ kind: 'landed', commit: MERGED_TIP })]);
    expect(fastForwardsAsked()).toEqual([TICKET_TIP, MERGED_TIP]);
    expect(current.gatedTrees).toEqual([TICKET_TREE, MERGED_TREE]);
    expect(current.board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['delivered', 'delivered']);
    expect(current.board.decisions()).toEqual([]);
    expect(current.board.incidents()).toEqual([]);
  });

  test('the slot is written on the merge job record in each phase\'s hold', async () => {
    harness = harnessAnswering();
    await harness.slots.sweep();
    expect(harness.phases).toEqual(['merge-in', 'gating', 'landing']);
  });
});

describe('the merged tree\'s gate', () => {
  function recordPassOn(current: AirlocksHarness, tree: string): void {
    current.board.recordGateRan({ tree, outcome: 'passed', cached: false }, HARNESS_AT);
  }

  test('runs no gate when the merged tree is the branch\'s own tree the gates last passed, and lands it', async () => {
    harness = harnessAnswering();
    recordPassOn(harness, TICKET_TREE);

    await harness.slots.sweep();

    expect(harness.gatedTrees).toEqual([]);
    expect(kindsLogged(harness, 'merge-landed')).toHaveLength(1);
  });

  test('gates a merged tree that differs from the tree the gates last passed, with the merge phase\'s gates', async () => {
    harness = harnessAnswering({ holdsMainLine: false });
    recordPassOn(harness, TICKET_TREE);

    await harness.slots.sweep();

    expect(harness.gatedTrees).toEqual([MERGED_TREE]);
    expect(harness.gatedPhases).toEqual(['merge']);
  });

  test('gates the branch\'s own tree the gates last passed when its green is current in review but not in the merge phase', async () => {
    harness = harnessAnswering();
    recordPassOn(harness, TICKET_TREE);
    harness.board.addGate({ name: 'audit', run: 'bun run audit' }, HARNESS_AT, ['merge']);

    await harness.slots.sweep();

    expect(harness.gatedTrees).toEqual([TICKET_TREE]);
    expect(harness.gatedPhases).toEqual(['merge']);
    expect(kindsLogged(harness, 'merge-landed')).toHaveLength(1);
  });

  test('a failed prepare step opens setup-failed, launches no agent, and lands nothing', async () => {
    harness = harnessAnswering();
    harness.settings.gateOutcome = 'setup-failed';

    await harness.slots.sweep();

    expect(harness.board.incidents().map((incident) => incident.kind)).toEqual(['setup-failed']);
    expect(harness.board.jobs().filter((job) => job.kind === 'merge-agent')).toEqual([]);
    expect(kindsLogged(harness, 'gate-ran')).toEqual([]);
    expect(fastForwardsAsked()).toEqual([]);
  });

  test('a ticket parked by hand while the slot holds it aborts the merge and frees the slot on the next sweep', async () => {
    harness = harnessAnswering();
    harness.settings.gateOutcome = 'failed';
    await harness.slots.sweep();
    harness.board.parkTicket('001', 'Parked', null, HARNESS_AT);

    await harness.slots.sweep();

    expect(harness.board.airlockHolderOf('main')).toBeUndefined();
    expect(endingsOf(harness)).toContain('merge-aborted');
    expect(fastForwardsAsked()).toEqual([]);
  });
});

describe('a target that moved under the slot', () => {
  test('requeues silently from branchTip, then parks after TARGET_MOVED_MERGES_BEFORE_PARKING moves in a row', async () => {
    harness = harnessAnswering();
    const current = harness;
    let moves = 0;
    current.settings.beforeGate = () => {
      moves += 1;
      if (moves === 1) recordedGit.answerFrom(answersOf(current, { mainTip: MOVED_MAIN_TIP, holdsMainLine: false }).beforeTheMergeIn);
      else recordedGit.answerFrom(answersOf(current, { mainTip: SECOND_MOVED_MAIN_TIP, holdsMainLine: false }).mergedIn);
    };

    await current.slots.sweep();

    expect(moves).toBe(2);
    expect(endingsOf(current)).toEqual(['target-moved', 'target-moved']);
    expect(current.board.tickets()[0]?.frontmatter.hold).toBe('parked:target-moved');
    expect(current.board.decisions().map((decision) => decision.kind)).toEqual(['parked']);
    expect(callsAsked(['reset', '--hard', '--quiet', TICKET_TIP])).toBe(2);
    expect(fastForwardsAsked()).toEqual([]);
  });

  test('without the ref denies, one target-moved decision opens per new tip and that target\'s landing waits', async () => {
    harness = harnessAnswering();
    harness.settings.refDeniesHold = false;
    const current = harness;
    current.settings.beforeGate = () => {
      recordedGit.answerFrom(answersOf(current, { mainTip: MOVED_MAIN_TIP, holdsMainLine: false }).beforeTheMergeIn);
      current.settings.beforeGate = () => undefined;
    };

    await current.slots.sweep();
    await current.slots.sweep();

    expect(current.board.decisions().map((decision) => [decision.kind, decision.context])).toEqual([['target-moved', MOVED_MAIN_TIP]]);
    expect(current.mergeJob()?.airlock?.phase).toBe('landing');
  });
});

describe('a merged tree whose line confinement refused', () => {
  test('opens sandbox-unavailable, logs no gate run and leaves the Airlock slot waiting', async () => {
    harness = harnessAnswering();
    harness.settings.gateOutcome = 'sandbox-unavailable';

    await harness.slots.sweep();

    expect(harness.board.incidents().map((incident) => [incident.kind, incident.defaultMove])).toEqual([['sandbox-unavailable', 'gate-retry']]);
    expect(kindsLogged(harness, 'gate-ran')).toEqual([]);
    expect(harness.mergeJob()?.airlock?.phase).toBe('gating');
  });
});

describe('a main checkout that blocks the fast-forward', () => {
  const BASE_TICKET: HarnessTicket = { id: '001' };

  test('shows dirty-main-checkout, rechecked every sweep, and lands once the checkout is clean', async () => {
    harness = harnessAnswering({ checkout: 'modified' }, BASE_TICKET);

    expect(await harness.slots.sweep()).toEqual([{
      target: 'main', branch: 'main', blockingFiles: ['base.ts'], heldFiles: []
    }]);
    expect(await harness.slots.sweep()).toHaveLength(1);
    expect(kindsLogged(harness, 'merge-started')).toHaveLength(1);

    recordedGit.answerFrom(answersOf(harness).beforeTheMergeIn);
    expect(await harness.slots.sweep()).toEqual([]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('not-on-main-line holds the target the same way, naming the branch checked out', async () => {
    harness = harnessAnswering({ checkedOut: 'example-elsewhere' });
    expect(await harness.slots.sweep()).toEqual([{
      target: 'main', branch: 'example-elsewhere', blockingFiles: [], heldFiles: []
    }]);
  });
});

describe('a stale green', () => {
  const MOVED_BRANCH = { branchTip: MOVED_BRANCH_TIP, branchTree: MOVED_BRANCH_TREE } as const;

  function removeWorktreeOf(current: AirlocksHarness): void {
    rmSync(current.worktreeOf('001'), { recursive: true, force: true });
  }

  test('a branch moved after its green loses mergeQueued, is gated in its own worktree with no slot held, and green queues and lands it', async () => {
    harness = harnessAnswering(MOVED_BRANCH);
    const current = harness;
    const seenAtTheGate: unknown[] = [];
    current.settings.beforeGate = () => seenAtTheGate.push([current.board.airlockHolderOf('main'), current.board.ticketIsMergeQueued('001')]);
    await current.slots.sweep();
    expect(seenAtTheGate[0]).toEqual([undefined, false]);
    expect(current.gatedTrees[0]).toBe(MOVED_BRANCH_TREE);
    expect(kindsLogged(current, 'merge-queued')).toHaveLength(2);
    expect(current.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test.each(['build', 'review'] as const)('a stale green taken in the %s phase is gated again in that phase, which its new green records', async (phase) => {
    harness = harnessAnswering(MOVED_BRANCH);
    harness.board.recordPipelineJudgedBy('001', TICKET_TREE, phase, HARNESS_AT);

    await harness.slots.sweep();

    expect(harness.gatedTrees[0]).toBe(MOVED_BRANCH_TREE);
    expect(harness.gatedPhases[0]).toBe(phase);
    expect(harness.board.greenPhaseOf('001')).toBe(phase);
  });

  test('a branch moved after its green loses mergeQueued even when its worktree is gone and cannot be gated', async () => {
    harness = harnessAnswering({ ...MOVED_BRANCH, headTree: null });
    removeWorktreeOf(harness);
    await harness.slots.sweep();
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(harness.gatedTrees).toEqual([]);
    expect(kindsLogged(harness, 'merge-started')).toEqual([]);
  });

  test.each([
    ['its worktree is gone', null, removeWorktreeOf],
    ['its worktree HEAD is not the branch tree', OTHER_TREE, () => undefined],
  ] as const)('a stale green that cannot be gated because %s leaves the ticket to the policy, which launches its next reviewer', async (_case, headTree, makeUngateable) => {
    harness = harnessAnswering({ ...MOVED_BRANCH, headTree });
    makeUngateable(harness);
    await harness.slots.sweep();
    expect(harness.gatedTrees).toEqual([]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
    harness.board.setOverseerState('running', HARNESS_AT);
    const advanced = harness.board.followPlaybook({ ...LIFECYCLE_LIMITS, now: HARNESS_AT, usageResetsAt: null }, {
      mainLine:                     'main',
      groupTargetPrefix:            'group-',
      installVersionChanged:        false,
      targetsHoldingManagedBlock:   [],
      ticketIdsTouchingAgentConfig: [],
      closedDeliveryTurns:          [],
      budgetSpentDeliveryTurns:     [],
      assistantHasAnswered:         false,
      assistantBootRetryDue:        false,
    }, () => ({ questions: [], context: '' }));
    expect(advanced.steps.filter((step) => step.kind === 'launch-review')).toEqual([{
      kind: 'launch-review', ticketId: '001', round: 1, target: 'main'
    }]);
  });

  test('without a review phase a stale green that cannot be gated keeps the ticket awaiting green, so a later sweep gates it again', async () => {
    harness = harnessAnswering({ ...MOVED_BRANCH, headTree: OTHER_TREE }, CHECKOUT_TICKET, false);
    await harness.slots.sweep();
    expect(harness.gatedTrees).toEqual([]);
    expect(harness.board.ticketsAwaitingGreenOf('main', () => 'main', () => MOVED_BRANCH_TREE)).toEqual([{ ticketId: '001', queued: false }]);

    recordedGit.answerFrom(answersOf(harness, MOVED_BRANCH).beforeTheMergeIn);
    await harness.slots.sweep();
    expect(harness.gatedTrees[0]).toBe(MOVED_BRANCH_TREE);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('a changed pipeline gates the unchanged tree again before the Airlock admits it', async () => {
    harness = harnessAnswering();
    harness.board.addGate({ name: 'tests', run: 'bun test' }, HARNESS_AT);
    await harness.slots.sweep();
    expect(harness.gatedTrees[0]).toBe(TICKET_TREE);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('red leaves the ticket in review unqueued with no green, and writes the red handoff for the next reviewer in the last review\'s folder', async () => {
    harness = harnessAnswering(MOVED_BRANCH);
    const review = harness.board.launchJob({
      kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, HARNESS_AT);
    harness.board.endJob(review.job.id, { outcome: 'reviewed' }, HARNESS_AT);
    harness.settings.gateOutcome = 'failed';
    await harness.slots.sweep();
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(harness.board.greenIsCurrent('001', MOVED_BRANCH_TREE, harness.board.greenPhaseOf('001'))).toBe(false);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
    expect(kindsLogged(harness, 'merge-started')).toEqual([]);
    expect(existsSync(join(harness.repository, '.example-tracker', 'jobs', review.job.id, 'stale-green', 'red-handoff.json'))).toBe(true);
  });
});

describe('a landing refused for its ticket', () => {
  test('an Acceptance not accounted for clears mergeQueued, holds the ticket and opens landing-refused', async () => {
    harness = harnessAnswering({}, { ...CHECKOUT_TICKET, body: '## Acceptance\n\nA1. Example item.\n' });
    await harness.slots.sweep();
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(harness.board.tickets()[0]?.frontmatter.hold).toBe('landing-refused:acceptance-unaccounted');
    expect(harness.board.decisions().map((decision) => [decision.kind, decision.context])).toEqual([['landing-refused', 'acceptance-unaccounted']]);
    expect(kindsLogged(harness, 'merge-started')).toHaveLength(1);
  });
});

describe('slot recovery', () => {
  test('a job in landing whose commit the main line already holds finishes the board side', async () => {
    harness = harnessAnswering();
    const current = harness;
    current.settings.beforeGate = () => recordedGit.answerFrom(answersOf(current, { mainTip: TICKET_TIP }).beforeTheMergeIn);
    await current.slots.sweep();
    expect(current.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(kindsLogged(current, 'merge-landed')).toHaveLength(1);
    expect(fastForwardsAsked()).toEqual([]);
  });
});
