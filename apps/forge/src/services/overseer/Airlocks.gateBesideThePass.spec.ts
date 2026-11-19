/**
 * The merged-tree gate runs beside the pass (design section 3.2, "Renewal that only progress earns"): a pass that waited through a gate
 * would withhold the lease's renewal for as long as the gate's lines run. What matters: a gating Airlock whose run is in flight stays in
 * `gating`, counts as no move and lands nothing until a later sweep finds the outcome; meanwhile the sweep goes on and lands another
 * target's ticket; a passed, a red and a cannot-run outcome settle as they did when the pass awaited them, and the Airlock lets the kept
 * outcome go after the hold that settled it; a stale green's re-gate goes the same way, its ticket keeping its mark while the run is in
 * flight, since an unqueued ticket in review is the policy's to hand to a reviewer and the next sweep would not list it again.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { commitResolved, linkedWorktreeRead, stepIn }                                from '../../testing/RecordedAirlockGit.ts';
import { GIT_CALL_SHAPES, useRecordedGit, type RecordedGitStep }                     from '../../testing/RecordedGit.ts';
import { AirlockAnswerSets, MOVED_AIRLOCK_IDS }                                      from './testing/AirlockAnswerSets.ts';
import { createRecordedAirlocksHarness, RECORDED_AIRLOCK_IDS, type AirlocksHarness } from './testing/AirlocksHarness.ts';
import {
  candidateReads,
  fastForwardIn,
  GROUP,
  groupReads,
  groupWorktreeOf
} from './testing/GroupAirlockAnswers.ts';

const recordedGit = useRecordedGit();

const { GROUP_TIP, TICKET_TIP, TICKET_TREE } = RECORDED_AIRLOCK_IDS;
const { MOVED_BRANCH_TIP, MOVED_BRANCH_TREE } = MOVED_AIRLOCK_IDS;

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function kindsLogged(current: AirlocksHarness, kind: string): unknown[] {
  return current.board.logRecordsSoFar().filter((record) => record.kind === kind);
}

/** Ticket #001 queued on the main line, its git answering from the main-line set of a branch that already holds main. */
function mainLineHarness(landing: { branchTip?: string; branchTree?: string } = {}): AirlocksHarness {
  const current = createRecordedAirlocksHarness([{ id: '001' }]);
  recordedGit.answerFrom(AirlockAnswerSets.mainLineAnswersOf({
    ticketId: '001', repository: current.repository, worktree: current.worktreeOf('001'), ...landing
  }).beforeTheMergeIn);
  return current;
}

describe('a merged-tree gate in flight', () => {
  test('leaves the job in gating, lands nothing and logs no gate run until a later sweep finds the outcome', async () => {
    harness = mainLineHarness();
    harness.settings.gateIsRunningIn = () => true;

    await harness.slots.sweep();
    await harness.slots.sweep();

    expect(harness.mergeJob()?.airlock?.phase).toBe('gating');
    expect(kindsLogged(harness, 'merge-landed')).toEqual([]);
    expect(kindsLogged(harness, 'gate-ran')).toEqual([]);
    expect(harness.settledGateTrees).toEqual([]);

    harness.settings.gateIsRunningIn = () => false;
    await harness.slots.sweep();

    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(harness.settledGateTrees).toEqual([TICKET_TREE]);
  });

  test('a sweep during it lands another target\'s ticket', async () => {
    harness = createRecordedAirlocksHarness([{ id: '001' }, { id: '010', group: 'example' }]);
    const current = harness;
    const groupWorktree = groupWorktreeOf(current);
    const groupCandidate: RecordedGitStep[] = [
      ...groupReads(GROUP_TIP, 'one'), ...candidateReads(current, '010', GROUP_TIP, true), ...linkedWorktreeRead(groupWorktree, current.repository),
    ];
    // The main line's merged tree differs from the group's, so the group's green on its tree never lands the main line's ungated.
    const afterTheGroupLanded: RecordedGitStep[] = [
      commitResolved(`refs/heads/${GROUP}`, TICKET_TIP),
      stepIn(groupWorktree, commitResolved('HEAD', TICKET_TIP)),
      stepIn(current.worktreeOf('010'), { gitArguments: ['reset', '--hard', '--quiet', TICKET_TIP], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT }),
      ...groupCandidate,
    ];
    const mainLine = AirlockAnswerSets.mainLineAnswersOf({
      ticketId:      '001',
      repository:    current.repository,
      worktree:      current.worktreeOf('001'),
      holdsMainLine: false,
      beforeLanding: [...groupCandidate, ...fastForwardIn(groupWorktree, GROUP, GROUP_TIP, TICKET_TIP, afterTheGroupLanded)],
    });
    afterTheGroupLanded.push(...mainLine.mergedIn);
    recordedGit.answerFrom(mainLine.beforeTheMergeIn);
    current.settings.gateIsRunningIn = (worktreePath) => worktreePath === current.worktreeOf('001');

    await current.slots.sweep();

    expect(current.mergeJob()?.airlock?.phase).toBe('gating');
    expect(current.board.tickets().map((ticket) => [ticket.frontmatter.id, ticket.frontmatter.status])).toEqual([['001', 'in-review'], ['010', 'reviewed']]);
  });
});

describe('an outcome the run kept', () => {
  test('a red outcome settles as before: the job goes to fixing, and the outcome is let go', async () => {
    harness = mainLineHarness();
    harness.settings.gateOutcome = 'failed';

    await harness.slots.sweep();

    expect(harness.mergeJob()?.airlock?.phase).toBe('fixing');
    expect(harness.settledGateTrees).toEqual([TICKET_TREE]);
  });

  test('a cannot-run outcome opens gate-cannot-run with the job still in gating, and the outcome is let go', async () => {
    harness = mainLineHarness();
    harness.settings.gateOutcome = 'cannot-run';

    await harness.slots.sweep();

    expect(harness.board.incidents().map((incident) => [incident.kind, incident.defaultMove])).toEqual([['gate-cannot-run', 'gate-retry']]);
    expect(harness.mergeJob()?.airlock?.phase).toBe('gating');
    expect(harness.settledGateTrees).toEqual([TICKET_TREE]);
  });
});

describe('a stale green\'s re-gate', () => {
  const MOVED_BRANCH = { branchTip: MOVED_BRANCH_TIP, branchTree: MOVED_BRANCH_TREE } as const;

  test('in flight it keeps the ticket\'s mark, which holds it from the policy and no slot opens on it, and a later sweep lands it', async () => {
    harness = mainLineHarness(MOVED_BRANCH);
    harness.settings.gateIsRunningIn = () => true;

    await harness.slots.sweep();

    expect(harness.board.ticketIsMergeQueued('001')).toBe(true);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
    expect(kindsLogged(harness, 'merge-started')).toEqual([]);

    harness.settings.gateIsRunningIn = () => false;
    await harness.slots.sweep();

    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(harness.settledGateTrees[0]).toBe(MOVED_BRANCH_TREE);
  });

  test('a red outcome leaves the ticket unqueued with no green, and the outcome is let go', async () => {
    harness = mainLineHarness(MOVED_BRANCH);
    harness.settings.gateOutcome = 'failed';

    await harness.slots.sweep();

    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(harness.board.greenIsCurrent('001', MOVED_BRANCH_TREE, harness.board.greenPhaseOf('001'))).toBe(false);
    expect(harness.settledGateTrees).toEqual([MOVED_BRANCH_TREE]);
  });
});
