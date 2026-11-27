/**
 * The minimal pipeline end to end: no gates in any phase and no review step. The world turns the Board's lifecycle pass, as Hephaestus's
 * DrivePass does, and the Airlocks' sweep, with the harness's fake launcher; a fake builder reports the way a verified build report settles.
 * What matters: a committed ticket is built, waits in review only for its Airlock and lands with no review job launched; a merge-in conflict
 * goes to its builder, the last worker, who resolves it in the Airlock; and the same world with a merge-train re-review runs the conflict
 * re-reviewer before the ticket lands. Git answers from the recorded answer sets of `src/services/hephaestus/testing/AirlockAnswerSets.ts`.
 */
import { afterEach, expect, test } from 'bun:test';

import type { PipelineAirlock }      from '../../domain/tracker-model/@types/Pipeline.ts';
import type { PlaybookObservations } from '../../domain/tracker-model/@types/PlaybookStep.ts';
import { LIFECYCLE_LIMITS }          from '../../shared/constants/LifecycleLimits.ts';
import { ancestryAsked }             from '../../testing/RecordedAirlockGit.ts';
import { useRecordedGit }            from '../../testing/RecordedGit.ts';
import { describeWhenGitIsRecorded } from '../../testing/ToolGuard.ts';
import { AirlockAnswerSets }         from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  finishMergeAgent,
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness
} from './testing/AirlocksHarness.ts';

const recordedGit = useRecordedGit();

const { TICKET_TIP, TICKET_TREE, MERGED_TIP } = RECORDED_AIRLOCK_IDS;

const TICKET_ID = '001';

const EXAMPLE_THRESHOLD_LINES = 50;

const WORLD_OBSERVATIONS: PlaybookObservations = {
  mainLine:                     'main',
  groupTargetPrefix:            'group-',
  installVersionChanged:        false,
  ticketIdsTouchingAgentConfig: [],
  closedDeliveryTurns:          [],
  budgetSpentDeliveryTurns:     [],
  assistantHasAnswered:         false,
  assistantBootRetryDue:        false,
};

const RESOLVED_REPORT = {
  outcome: 'resolved', resolvedFiles: ['shared.txt'], notes: '', reportKind: null
} as const;

const RE_REVIEW_THAT_HOLDS = {
  role:       'reviewer',
  headCommit: MERGED_TIP,
  claims:     [{
    item: 'A1', result: 'holds', handoffContradicted: false, note: ''
  }],
  findings:   [],
  reviewText: 'Example re-review of the resolution.',
} as const;

let world: AirlocksHarness | null = null;

afterEach(() => {
  world?.remove();
  world = null;
});

/** One committed ticket on a running board whose pipeline is the minimal one, with the merge train's re-review when one is given. */
function minimalPipelineWorld(airlock: PipelineAirlock | null): AirlocksHarness {
  const current = createRecordedAirlocksHarness([{ id: TICKET_ID, status: 'committed' }], {}, false, airlock);
  current.board.setHephaestusState('running', HARNESS_AT);
  return current;
}

/** The Board's lifecycle pass, with the limits and the clock the DrivePass gives it. */
function lifecyclePass(current: AirlocksHarness): void {
  current.board.followPlaybook({ ...LIFECYCLE_LIMITS, now: HARNESS_AT, usageResetsAt: null }, WORLD_OBSERVATIONS, () => ({ questions: [], context: '' }));
}

function launchedJobs(current: AirlocksHarness): [unknown, unknown][] {
  return current.board.logRecordsSoFar()
    .flatMap((record) => (record.kind === 'job-launched' && record.fields.kind !== 'assistant' ? [[record.fields.kind, record.fields.role]] : []));
}

/**
 * The lifecycle launches the build; its builder runs and reports, and the report settles as a verified build with no build gate does: the
 * branch tree is the row's build-phase green, the job ends built, the ticket waits in review, and with no review step it queues at once.
 */
function builtByTheLifecycle(current: AirlocksHarness): void {
  lifecyclePass(current);
  const build = current.board.jobs().find((job) => job.kind === 'build');
  if (build === undefined) throw new Error('The lifecycle launched no build.');
  current.board.moveJob(build.id, 'running', HARNESS_AT);
  current.board.moveTicket(TICKET_ID, 'in-progress', { checksLegality: true }, HARNESS_AT);
  current.board.moveJob(build.id, 'in-customs', HARNESS_AT);
  current.board.recordPipelineJudgedBy(TICKET_ID, TICKET_TREE, current.board.gateRunStampOf('build'), HARNESS_AT);
  current.board.endJob(build.id, { outcome: 'built', commit: TICKET_TIP }, HARNESS_AT);
  current.board.moveTicket(TICKET_ID, 'in-review', { checksLegality: true, branch: `ticket-${TICKET_ID}`, commit: TICKET_TIP }, HARNESS_AT);
  expect(current.board.pipeline()?.review).toBeUndefined();
  expect(current.board.greenIsCurrent(TICKET_ID, TICKET_TREE, current.board.greenPhaseOf(TICKET_ID))).toBe(true);
  current.board.queueTicketForMerge(TICKET_ID, 'main', TICKET_TREE, HARNESS_AT);
  lifecyclePass(current);
}

/** The merge-in conflicts, so the Airlock launches its fixer, which resolves it; the next sweep settles the resolution. */
async function conflictResolvedInTheAirlock(current: AirlocksHarness, resolutionLines: number): Promise<void> {
  recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeIn(TICKET_ID));
  await current.slots.sweep();
  expect(current.mergeJob()?.airlock?.phase).toBe('resolving');
  current.settings.resolutionLines = resolutionLines;
  recordedGit.answerFrom([...AirlockAnswerSets.resolvedAndMerged(), ancestryAsked(MERGED_TIP, 'HEAD', true)]);
  finishMergeAgent(current, RESOLVED_REPORT);
  await current.slots.sweep();
}

describeWhenGitIsRecorded('a ticket on the minimal pipeline', () => {
  test('goes from committed to landed with no gate in its pipeline and no review job, its branch already holding the main line', async () => {
    world = minimalPipelineWorld(null);
    expect(world.board.pipeline()?.phases).toEqual({ build: [], review: [], merge: [] });

    builtByTheLifecycle(world);
    const landing = { ticketId: TICKET_ID, repository: world.repository, worktree: world.worktreeOf(TICKET_ID) };
    recordedGit.answerFrom(AirlockAnswerSets.mainLineAnswersOf(landing).beforeTheMergeIn);
    await world.slots.sweep();
    lifecyclePass(world);

    expect(world.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(launchedJobs(world)).toEqual([['build', 'builder'], ['merge', null]]);
    expect(world.board.jobs().filter((job) => job.kind !== 'assistant')).toEqual([]);
  });

  test('has its Airlock conflict fixed by its builder, the last worker, and then lands', async () => {
    world = minimalPipelineWorld(null);
    builtByTheLifecycle(world);

    await conflictResolvedInTheAirlock(world, Number.MAX_SAFE_INTEGER);
    lifecyclePass(world);

    expect(world.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(launchedJobs(world)).toEqual([['build', 'builder'], ['merge', null], ['merge-agent', 'builder']]);
  });
});

describeWhenGitIsRecorded('the same world with a merge-train re-review', () => {
  test('runs the conflict re-reviewer on a resolution above the threshold before the ticket lands', async () => {
    world = minimalPipelineWorld({ reReview: { thresholdLines: EXAMPLE_THRESHOLD_LINES } });
    builtByTheLifecycle(world);

    await conflictResolvedInTheAirlock(world, EXAMPLE_THRESHOLD_LINES + 1);
    expect(world.mergeJob()?.airlock?.phase).toBe('re-reviewing');
    expect(world.mergeAgent()).toMatchObject({ role: 'conflict-re-reviewer', attempt: 1 });

    recordedGit.answerFrom([...AirlockAnswerSets.resolvedAndMerged(), ancestryAsked(MERGED_TIP, 'HEAD', true)]);
    finishMergeAgent(world, RE_REVIEW_THAT_HOLDS);
    await world.slots.sweep();
    lifecyclePass(world);

    expect(world.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(launchedJobs(world)).toEqual([['build', 'builder'], ['merge', null], ['merge-agent', 'builder'], ['merge-agent', 'conflict-re-reviewer']]);
  });
});
