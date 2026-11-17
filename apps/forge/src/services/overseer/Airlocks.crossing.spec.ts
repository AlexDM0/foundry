/**
 * The Airlock of a ticket of the shop that crossed into the package `tokens`, one named claim per case of strategy 5.7. What matters: the
 * landing gates every entity it changes and their consumers (E60), and a clean merge-in of a main line that changed the same package keeps
 * the seal and needs no package review (E61); a conflict goes to the entity that owns the files, a package's files to its builder and its
 * conflict re-reviewer whatever the size (E62), the home's files to the ticket's last home worker and its re-reviewer above the threshold
 * (E63), and a conflict in both to the package's builder first, which leaves the merge open, then to the home's worker, which commits it
 * (E64), and a worker that hands its own part on unresolved refuses the merge, so no part goes back to it; a package's builder that
 * resumes its build's session runs on the resumed call budget; a red merged tree and a stale green turned red go back to the entity that
 * owns the red gate, a package's or a consumer's gate to the package's build with the seal lifted and the return counted, the home's gate
 * to `adapt`, and a second package return parks the ticket (E65, E45); an abandoned ticket never takes the Airlock (E67); and a group's
 * landing gates only the entities it changes (E68). E66 is the review's catch-up, in `JobLaunch.targetCatchUp.spec.ts`. Git answers from
 * the recorded answer sets of `src/services/overseer/testing/AirlockAnswerSets.ts`.
 */
import { join } from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Pipeline, PipelineEntity }              from '../../lib/tracker-model/@types/Pipeline.ts';
import type { TicketStage }                           from '../../lib/tracker-model/@types/Task.ts';
import type { Board }                                 from '../../lib/tracker-model/Board.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET }             from '../../shared/constants/OverseerLimits.ts';
import { commitResolved, linkedWorktreeRead, stepIn } from '../../testing/RecordedAirlockGit.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStep,
  useRecordedGit
} from '../../testing/RecordedGit.ts';
import { describeWhenGitIsRecorded }                                  from '../../testing/ToolGuard.ts';
import { AIRLOCK_FACT_NAMES, KEPT_FACT_TRUE }                         from './AirlockFactsFile.ts';
import { RedHandoff }                                                 from './RedHandoff.ts';
import { AirlockAnswerSets, MOVED_AIRLOCK_IDS, type MainLineLanding } from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  finishMergeAgent,
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness
} from './testing/AirlocksHarness.ts';
import {
  candidateReads,
  fastForwardIn,
  GROUP,
  groupReads,
  groupWorktreeOf
} from './testing/GroupAirlockAnswers.ts';

const recordedGit = useRecordedGit();

const { MAIN_TIP, GROUP_TIP, TICKET_TIP } = RECORDED_AIRLOCK_IDS;

function entityOf(kind: PipelineEntity['kind'], home: string, verifyLine: string, rest: Partial<PipelineEntity> = {}): PipelineEntity {
  return {
    kind,
    home:    [home],
    prepare: [],
    gates:   [{ name: 'verify', run: verifyLine }],
    phases:  { build: ['verify'], review: ['verify'], merge: ['verify'] },
    review:  { name: 'Review' },
    ...rest,
  };
}

const ENTITIES: NonNullable<Pipeline['entities']> = {
  shop:   entityOf('app', '/apps/shop', 'bun run verify:shop', { dependsOn: ['tokens'], whitelist: ['tokens'] }),
  admin:  entityOf('app', '/apps/admin', 'bun run verify:admin', { dependsOn: ['tokens'] }),
  tokens: entityOf('package', '/packages/tokens', 'bun run verify:tokens'),
};

const PACKAGE_FILE = 'packages/tokens/Colour.ts';
const HOME_FILE    = 'apps/shop/Cart.ts';
const SEAL         = 'example-tokens-seal';
const RE_REVIEW_THRESHOLD_LINES = 800;

const PACKAGE_BUILD: TicketStage  = { name: 'package-build', entity: 'tokens' };
const PACKAGE_REVIEW: TicketStage = { name: 'package-review', entity: 'tokens' };
const HOME_REVIEW: TicketStage    = { name: 'review', entity: 'shop' };

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

/** One stage job of ticket #001, launched and ended as the stage's run left it; returns its id. */
function ranStageJob(board: Board, kind: 'build' | 'review', stage: TicketStage, stageNumber: number, outcome: 'built' | 'reviewed'): string {
  const launched = board.launchJob({
    kind, role: kind === 'build' ? 'builder' : 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main', entity: stage.entity, stage: stageNumber
  }, HARNESS_AT);
  board.endJob(launched.job.id, { outcome }, HARNESS_AT);
  return launched.job.id;
}

interface CrossedTicket {
  packageBuildJobId: string;
}

/**
 * Ticket #001 of the shop crossed into `tokens`: its package build and review ran, the package's change was sealed and its home review ran,
 * as many times as `packageRuns` says, each run after the first a package return.
 */
function crossIntoTokens(board: Board, packageRuns = 1): CrossedTicket {
  let packageBuildJobId = '';
  for (let run = 0; run < packageRuns; run += 1) {
    if (run === 0) board.moveTicketStage('001', PACKAGE_BUILD, HARNESS_AT);
    else board.returnTicketToPackage('001', 'tokens', HARNESS_AT);
    packageBuildJobId = ranStageJob(board, 'build', PACKAGE_BUILD, 2, 'built');
    board.moveTicketStage('001', PACKAGE_REVIEW, HARNESS_AT);
    ranStageJob(board, 'review', PACKAGE_REVIEW, 3, 'reviewed');
    board.sealTicketPackage('001', 'tokens', SEAL, HARNESS_AT);
    board.moveTicketStage('001', HOME_REVIEW, HARNESS_AT);
    ranStageJob(board, 'review', HOME_REVIEW, 5, 'reviewed');
  }
  return { packageBuildJobId };
}

/** The paths the fast-forward to the merged tree changes, as git names them in the slot's worktree against `targetTip`. */
function landingPathsAsked(current: AirlocksHarness, changedPath: string, targetTip: string = MAIN_TIP): RecordedGitStep {
  return stepIn(current.worktreeOf('001'), {
    gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', targetTip, '--'],
    answeredAs:   GIT_CALL_SHAPES.FILES_CHANGED_UP_TO_A_COMMIT,
    filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: changedPath },
  });
}

function crossingHarness(airlock: Pipeline['airlock'] | null = null): AirlocksHarness {
  return createRecordedAirlocksHarness([{ id: '001', entity: 'shop' }], {}, true, airlock ?? null, false, null, ENTITIES);
}

/** The crossed ticket's Airlock, its git answering a clean landing of `changedPath` from the main-line sets of `landing`. */
function cleanLandingHarness(changedPath: string, landing: Partial<MainLineLanding> = {}, packageRuns = 1): { current: AirlocksHarness; crossed: CrossedTicket } {
  const current = crossingHarness();
  const crossed = crossIntoTokens(current.board, packageRuns);
  const answers = AirlockAnswerSets.mainLineAnswersOf({
    ticketId: '001', repository: current.repository, worktree: current.worktreeOf('001'), beforeLanding: [landingPathsAsked(current, changedPath)], ...landing
  });
  recordedGit.answerFrom(answers.beforeTheMergeIn);
  return { current, crossed };
}

/** The crossed ticket's Airlock stopped on a merge-in conflicting in `conflictedFiles`, its first worker launched. */
async function conflictingHarness(conflictedFiles: readonly string[], airlock: Pipeline['airlock'] | null = null): Promise<AirlocksHarness> {
  const current = crossingHarness(airlock);
  crossIntoTokens(current.board);
  recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeInOf('001', conflictedFiles));
  await current.slots.sweep();
  return current;
}

function agentScopeOf(current: AirlocksHarness): unknown {
  const agent = current.mergeAgent();
  return { role: agent?.role, entity: agent?.entity, stage: agent?.stage };
}

describe('a crossing ticket\'s landing (strategy 5.7)', () => {
  test('gates every entity the merged tree changes and the entities that consume them, and lands on their green (E60)', async () => {
    harness = cleanLandingHarness(PACKAGE_FILE).current;

    await harness.slots.sweep();

    expect(harness.gatedEntities).toEqual([['shop', 'admin', 'tokens']]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('keeps the seal and runs no package review when the main line changed the same package with no conflict: the gates decide (E61)', async () => {
    harness = cleanLandingHarness(PACKAGE_FILE, { holdsMainLine: false }).current;

    await harness.slots.sweep();

    expect(harness.board.logRecordsSoFar().some((record) => record.kind === 'job-launched' && record.fields.kind === 'merge-agent')).toBe(false);
    expect(harness.gatedEntities).toEqual([['shop', 'admin', 'tokens']]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });
});

describeWhenGitIsRecorded('a crossing ticket\'s conflict, routed by owner', () => {
  test('in package files goes to the package\'s builder, then to its conflict re-reviewer whatever the size (E62)', async () => {
    harness = await conflictingHarness([PACKAGE_FILE]);

    expect(agentScopeOf(harness)).toEqual({ role: 'builder', entity: 'tokens', stage: 2 });
    expect(harness.keptAirlockFacts.get(harness.mergeJob()?.id ?? '')).toEqual({ [AIRLOCK_FACT_NAMES.conflictedFiles]: PACKAGE_FILE });

    recordedGit.answerFrom(AirlockAnswerSets.mergeCommittedOver([PACKAGE_FILE]));
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: [PACKAGE_FILE], notes: '', reportKind: null
    });
    await harness.slots.sweep();

    expect(harness.mergeJob()?.airlock?.phase).toBe('re-reviewing');
    expect(agentScopeOf(harness)).toEqual({ role: 'conflict-re-reviewer', entity: 'tokens', stage: 3 });
  });

  test('in home files goes to the ticket\'s last home worker in its stage, and to the home\'s re-reviewer above the threshold (E63)', async () => {
    harness = await conflictingHarness([HOME_FILE], { reReview: { thresholdLines: RE_REVIEW_THRESHOLD_LINES } });

    expect(agentScopeOf(harness)).toEqual({ role: 'reviewer', entity: 'shop', stage: 5 });

    harness.settings.resolutionLines = RE_REVIEW_THRESHOLD_LINES + 1;
    recordedGit.answerFrom(AirlockAnswerSets.mergeCommittedOver([HOME_FILE]));
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: [HOME_FILE], notes: '', reportKind: null
    });
    await harness.slots.sweep();

    expect(agentScopeOf(harness)).toEqual({ role: 'conflict-re-reviewer', entity: 'shop', stage: 5 });
  });

  test('in both goes to the package\'s builder, which leaves the merge open, then to the home\'s worker, which commits the one merge (E64)', async () => {
    harness = await conflictingHarness([PACKAGE_FILE, HOME_FILE]);
    const mergeJobId = harness.mergeJob()?.id ?? '';

    expect(agentScopeOf(harness)).toEqual({ role: 'builder', entity: 'tokens', stage: 2 });
    expect(harness.keptAirlockFacts.get(mergeJobId)).toEqual({ [AIRLOCK_FACT_NAMES.conflictedFiles]: PACKAGE_FILE, [AIRLOCK_FACT_NAMES.leavesTheMergeOpen]: KEPT_FACT_TRUE });

    recordedGit.answerFrom(AirlockAnswerSets.mergeLeftOpen([HOME_FILE]));
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: [PACKAGE_FILE], notes: '', reportKind: null
    });
    await harness.slots.sweep();

    expect(harness.mergeJob()?.airlock?.phase).toBe('resolving');
    expect(agentScopeOf(harness)).toEqual({ role: 'reviewer', entity: 'shop', stage: 5 });
    expect(harness.keptAirlockFacts.get(mergeJobId)).toEqual({ [AIRLOCK_FACT_NAMES.conflictedFiles]: HOME_FILE, [AIRLOCK_FACT_NAMES.filesResolvedBefore]: PACKAGE_FILE });

    recordedGit.answerFrom(AirlockAnswerSets.mergeCommittedOver([PACKAGE_FILE, HOME_FILE]));
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: [HOME_FILE], notes: '', reportKind: null
    });
    await harness.slots.sweep();

    expect(harness.board.decisions()).toEqual([]);
    expect(agentScopeOf(harness)).toEqual({ role: 'conflict-re-reviewer', entity: 'tokens', stage: 3 });
  });

  test('a package\'s builder that commits the merge while home files still conflict refuses the merge', async () => {
    harness = await conflictingHarness([PACKAGE_FILE, HOME_FILE]);

    recordedGit.answerFrom([...AirlockAnswerSets.mergeLeftOpen([PACKAGE_FILE, HOME_FILE]), ...AirlockAnswerSets.stoppedOnTheConflict(false)]);
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: [PACKAGE_FILE], notes: 'Example notes', reportKind: null
    });
    await harness.slots.sweep();

    expect(harness.board.decisions().map((decision) => decision.kind)).toEqual(['merge-refused']);
    expect(harness.mergeJob()).toBeUndefined();
  });

  test('a worker that hands the merge on with its own part still unmerged refuses the merge, whatever its report lists, so nothing loops', async () => {
    harness = await conflictingHarness([PACKAGE_FILE, HOME_FILE]);

    recordedGit.answerFrom([...AirlockAnswerSets.mergeLeftOpen([PACKAGE_FILE, HOME_FILE]), ...AirlockAnswerSets.stoppedOnTheConflict(false)]);
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: [], notes: 'Example notes', reportKind: null
    });
    await harness.slots.sweep();

    expect(harness.board.decisions().map((decision) => decision.kind)).toEqual(['merge-refused']);
    expect(harness.board.logRecordsSoFar().filter((record) => record.kind === 'job-launched' && record.fields.kind === 'merge-agent')).toHaveLength(1);
  });

  test('a package\'s builder that resumes its build\'s session in the Airlock is held to the resumed call budget', async () => {
    harness = await conflictingHarness([PACKAGE_FILE]);
    const agentId = harness.mergeAgent()?.id ?? '';
    harness.board.moveJob(agentId, 'running', HARNESS_AT);
    harness.settings.reading = { calls: RED_HANDOFF_RESUME_CALL_BUDGET, report: undefined };
    recordedGit.answerFrom(AirlockAnswerSets.stoppedOnTheConflict(false));

    await harness.slots.sweep();

    expect(harness.stopped).toEqual([agentId]);
    expect(harness.board.decisions().map((decision) => decision.kind)).toEqual(['merge-refused']);
  });
});

describeWhenGitIsRecorded('a crossing ticket\'s red merged tree, routed to the owner of the red gate (E65)', () => {
  function failWith(current: AirlocksHarness, gateEntity: string): void {
    current.settings.gateOutcome = 'failed';
    current.settings.gateStep    = 'verify';
    current.settings.gateEntity  = gateEntity;
  }

  test('a package\'s gate returns the ticket to the package\'s build, its seal lifted and the return counted, with the red handoff', async () => {
    const { current, crossed } = cleanLandingHarness(PACKAGE_FILE);
    harness = current;
    failWith(harness, 'tokens');

    await harness.slots.sweep();

    expect(harness.mergeJob()).toBeUndefined();
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-progress');
    expect(harness.board.ticketStageOf('001')).toEqual(PACKAGE_BUILD);
    expect(harness.board.ticketSealsOf('001')).toEqual({});
    expect(harness.board.ticketPackageReturnsOf('001')).toBe(1);
    const staleGreenFolder = join(harness.repository, '.example-tracker', 'jobs', crossed.packageBuildJobId, 'stale-green');
    expect(RedHandoff.redHandoffFactsOf(staleGreenFolder)).toMatchObject({ kind: 'gate', name: 'verify', command: 'bun run verify:tokens' });
  });

  test('a gate of an entity that consumes the package is the package\'s too: its change must not break its dependents', async () => {
    harness = cleanLandingHarness(PACKAGE_FILE).current;
    failWith(harness, 'admin');

    await harness.slots.sweep();

    expect(harness.board.ticketStageOf('001')).toEqual(PACKAGE_BUILD);
  });

  test('a home gate returns the ticket to adapt, the seal kept', async () => {
    harness = cleanLandingHarness(PACKAGE_FILE).current;
    failWith(harness, 'shop');

    await harness.slots.sweep();

    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-progress');
    expect(harness.board.ticketStageOf('001')).toEqual({ name: 'adapt', entity: 'shop' });
    expect(harness.board.ticketSealsOf('001')).toEqual({ tokens: SEAL });
    expect(harness.board.ticketPackageReturnsOf('001')).toBe(0);
  });

  test('a package\'s gate that would be a second package return parks the ticket for User instead (E45)', async () => {
    harness = cleanLandingHarness(PACKAGE_FILE, {}, 2).current;
    failWith(harness, 'tokens');

    await harness.slots.sweep();

    expect(harness.board.tickets()[0]?.frontmatter.hold).toBe('parked:second-return');
    expect(harness.board.decisions().map((decision) => decision.kind)).toEqual(['parked']);
    expect(harness.board.ticketStageOf('001')).toEqual(HOME_REVIEW);
    expect(harness.board.ticketPackageReturnsOf('001')).toBe(1);
  });
});

describe('a crossing ticket\'s stale green that turned red, routed to the owner of the red gate (E65)', () => {
  /** The crossed ticket waits in its home review, its green stale on a moved branch, and its gate runs red on `gateEntity`'s gate. */
  function staleGreenRedHarness(gateEntity: string): { current: AirlocksHarness; crossed: CrossedTicket } {
    const current = crossingHarness();
    const crossed = crossIntoTokens(current.board);
    recordedGit.answerFrom(AirlockAnswerSets.mainLineAnswersOf({
      ticketId:   '001',
      repository: current.repository,
      worktree:   current.worktreeOf('001'),
      branchTip:  MOVED_AIRLOCK_IDS.MOVED_BRANCH_TIP,
      branchTree: MOVED_AIRLOCK_IDS.MOVED_BRANCH_TREE,
    }).beforeTheMergeIn);
    current.settings.gateOutcome = 'failed';
    current.settings.gateStep    = 'verify';
    current.settings.gateEntity  = gateEntity;
    return { current, crossed };
  }

  test('a package\'s gate returns the ticket to the package\'s build, its seal lifted and the return counted, with the red handoff', async () => {
    const { current, crossed } = staleGreenRedHarness('tokens');
    harness = current;

    await harness.slots.sweep();

    expect(harness.gatedTrees[0]).toBe(MOVED_AIRLOCK_IDS.MOVED_BRANCH_TREE);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-progress');
    expect(harness.board.ticketStageOf('001')).toEqual(PACKAGE_BUILD);
    expect(harness.board.ticketSealsOf('001')).toEqual({});
    expect(harness.board.ticketPackageReturnsOf('001')).toBe(1);
    const staleGreenFolder = join(harness.repository, '.example-tracker', 'jobs', crossed.packageBuildJobId, 'stale-green');
    expect(RedHandoff.redHandoffFactsOf(staleGreenFolder)).toMatchObject({ kind: 'gate', name: 'verify', command: 'bun run verify:tokens' });
  });

  test('a home gate returns the ticket to adapt, the seal kept', async () => {
    harness = staleGreenRedHarness('shop').current;

    await harness.slots.sweep();

    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-progress');
    expect(harness.board.ticketStageOf('001')).toEqual({ name: 'adapt', entity: 'shop' });
    expect(harness.board.ticketSealsOf('001')).toEqual({ tokens: SEAL });
  });
});

describe('a crossing ticket abandoned in any stage', () => {
  test('never takes the Airlock, so nothing of its package change reaches the main line (E67)', async () => {
    harness = crossingHarness();
    crossIntoTokens(harness.board);
    harness.board.moveTicket('001', 'abandoned', { checksLegality: true, reason: 'Example reason' }, HARNESS_AT);
    recordedGit.answerFrom([]);

    await harness.slots.sweep();

    expect(harness.board.logRecordsSoFar().some((record) => record.kind === 'job-launched' && record.fields.kind === 'merge')).toBe(false);
    expect(recordedGit.flowCalls()).toEqual([]);
  });
});

describeWhenGitIsRecorded('a crossing ticket in a group (E68)', () => {
  test('lands on the group\'s branch gated only by the entities it changes, their consumers left to the group\'s release', async () => {
    harness = createRecordedAirlocksHarness([{ id: '001', entity: 'shop', group: 'example' }], {}, true, null, false, null, ENTITIES);
    crossIntoTokens(harness.board);
    const groupWorktree = groupWorktreeOf(harness);
    const beforeTheLanding: RecordedGitStep[] = [
      ...groupReads(GROUP_TIP, 'one'),
      ...candidateReads(harness, '001', GROUP_TIP, true),
      ...linkedWorktreeRead(groupWorktree, harness.repository),
      landingPathsAsked(harness, PACKAGE_FILE, GROUP_TIP),
    ];
    const landed: RecordedGitStep[] = [commitResolved(`refs/heads/${GROUP}`, TICKET_TIP), stepIn(groupWorktree, commitResolved('HEAD', TICKET_TIP)), ...beforeTheLanding];
    recordedGit.answerFrom([...beforeTheLanding, ...fastForwardIn(groupWorktree, GROUP, GROUP_TIP, TICKET_TIP, landed)]);

    await harness.slots.sweep();

    expect(harness.gatedEntities).toEqual([['tokens']]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('reviewed');
  });
});
