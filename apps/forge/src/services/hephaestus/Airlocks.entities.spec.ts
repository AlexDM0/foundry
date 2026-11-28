/**
 * The Airlock of a forge with entities: the landing gates the entities its fast-forward changes and their consumers, every entity for a root-owned
 * path, and lands ungated only on a green naming that whole set; a forge without entities asks git only what it always asked; and a red handoff names
 * the gate's command from its own entity's pipeline.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Pipeline, PipelineEntity } from '../../domain/tracker-model/@types/Pipeline.ts';
import { stepIn }                        from '../../testing/RecordedAirlockGit.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStep,
  useRecordedGit
} from '../../testing/RecordedGit.ts';
import { AirlockAnswerSets, MOVED_AIRLOCK_IDS, type MainLineLanding } from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness,
  type HarnessTicket
} from './testing/AirlocksHarness.ts';

const recordedGit = useRecordedGit();

const { MAIN_TIP } = RECORDED_AIRLOCK_IDS;

function entityOf(kind: PipelineEntity['kind'], home: string, verifyLine: string, dependsOn: string[] = []): PipelineEntity {
  return {
    kind,
    home:    [home],
    prepare: [],
    gates:   [{ name: 'verify', run: verifyLine }],
    phases:  { build: ['verify'], review: ['verify'], merge: ['verify'] },
    review:  { name: 'Review' },
    ...(dependsOn.length === 0 ? {} : { dependsOn }),
  };
}

const ENTITIES: NonNullable<Pipeline['entities']> = {
  shop:   entityOf('app', '/apps/shop', 'bun run verify:shop', ['tokens']),
  admin:  entityOf('app', '/apps/admin', 'bun run verify:admin'),
  tokens: entityOf('package', '/packages/tokens', 'bun run verify:tokens'),
};

const SHOP_TICKET: HarnessTicket = { id: '001', entity: 'shop' };

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

/** The paths the fast-forward to the merged tree changes, as git names them in the slot's worktree. */
function landingPathsAsked(current: AirlocksHarness, changedPath: string): RecordedGitStep {
  return stepIn(current.worktreeOf('001'), {
    gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', MAIN_TIP, '--'],
    answeredAs:   GIT_CALL_SHAPES.FILES_CHANGED_UP_TO_A_COMMIT,
    filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: changedPath },
  });
}

/** A harness of ticket `001` on a pipeline with entities, whose git answers from the main-line sets of `landing`. */
function entitiesHarness(changedPath: string | null, landing: Partial<MainLineLanding> = {}, ticket: HarnessTicket = SHOP_TICKET): AirlocksHarness {
  const current = createRecordedAirlocksHarness([ticket], {}, true, null, false, null, ENTITIES);
  const answers = AirlockAnswerSets.mainLineAnswersOf({
    ticketId: '001', repository: current.repository, worktree: current.worktreeOf('001'), ...landing
  });
  recordedGit.answerFrom(changedPath === null ? answers.beforeTheMergeIn : [...answers.beforeTheMergeIn, landingPathsAsked(current, changedPath)]);
  return current;
}

function redHandoffCommandIn(jobFolder: string): unknown {
  return (JSON.parse(readFileSync(join(jobFolder, 'red-handoff.json'), 'utf8')) as Record<string, unknown>)['command'];
}

describe('the landing\'s gate set', () => {
  test('is the entities the merged tree changes and the entities that consume them, and their green lands the ticket (E60)', async () => {
    harness = entitiesHarness('packages/tokens/Colour.ts');

    await harness.slots.sweep();

    expect(harness.gatedPhases).toEqual(['merge']);
    expect(harness.gatedEntities).toEqual([['shop', 'tokens']]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('gates the consumers of the ticket\'s entity on the branch\'s own tree the gates last passed, when its green names only its entity (E60)', async () => {
    harness = entitiesHarness('packages/tokens/Colour.ts', {}, { id: '001', entity: 'tokens' });
    harness.board.recordGateRan({ tree: RECORDED_AIRLOCK_IDS.TICKET_TREE, outcome: 'passed', cached: false }, HARNESS_AT);

    await harness.slots.sweep();

    expect(harness.gatedTrees).toEqual([RECORDED_AIRLOCK_IDS.TICKET_TREE]);
    expect(harness.gatedEntities).toEqual([['shop', 'tokens']]);
    expect(harness.board.tasks()[0]?.pipelineHashes).toEqual({ shop: expect.any(String), tokens: expect.any(String) });
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('lands the branch\'s own tree the gates last passed without a gate, when its green names every entity of the gate set', async () => {
    harness = entitiesHarness('apps/admin/Main.ts', {}, { id: '001', entity: 'admin' });
    harness.board.recordGateRan({ tree: RECORDED_AIRLOCK_IDS.TICKET_TREE, outcome: 'passed', cached: false }, HARNESS_AT);

    await harness.slots.sweep();

    expect(harness.gatedEntities).toEqual([]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('is every entity for a root-owned path (E4)', async () => {
    harness = entitiesHarness('bun.lock');

    await harness.slots.sweep();

    expect(harness.gatedEntities).toEqual([['shop', 'admin', 'tokens']]);
  });

  test('is never asked of git on a forge without entities, which gates its merged tree naming no entity', async () => {
    harness = createRecordedAirlocksHarness([{ id: '001' }]);
    recordedGit.answerFrom(AirlockAnswerSets.mainLineAnswersOf({ ticketId: '001', repository: harness.repository, worktree: harness.worktreeOf('001') }).beforeTheMergeIn);

    await harness.slots.sweep();

    expect(harness.gatedEntities).toEqual([undefined]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(harness.board.tasks()[0]?.pipelineHashes).toBeUndefined();
  });

  test('a red merged tree hands the agent the command of the red gate\'s own entity', async () => {
    harness = entitiesHarness('packages/tokens/Colour.ts');
    harness.settings.gateOutcome = 'failed';
    harness.settings.gateStep    = 'verify';
    harness.settings.gateEntity  = 'tokens';
    const current = harness;
    let mergeJobFolder = '';
    current.settings.beforeGate = () => {
      mergeJobFolder = join(current.repository, '.example-tracker', 'jobs', current.mergeJob()?.id ?? '');
    };

    await current.slots.sweep();

    expect(redHandoffCommandIn(mergeJobFolder)).toBe('bun run verify:tokens');
  });
});

describe('a stale green on a forge with entities', () => {
  const MOVED_BRANCH = { branchTip: MOVED_AIRLOCK_IDS.MOVED_BRANCH_TIP, branchTree: MOVED_AIRLOCK_IDS.MOVED_BRANCH_TREE } as const;

  test('is gated again by its ticket\'s own entity, whose green queues it again', async () => {
    harness = entitiesHarness('apps/shop/Main.ts', MOVED_BRANCH);

    await harness.slots.sweep();

    expect(harness.gatedTrees[0]).toBe(MOVED_AIRLOCK_IDS.MOVED_BRANCH_TREE);
    expect(harness.gatedPhases[0]).toBe('review');
    expect(harness.gatedEntities[0]).toEqual(['shop']);
    expect(harness.board.tasks()[0]?.pipelineHashes).toEqual(expect.objectContaining({ shop: expect.any(String) }));
  });

  test('that turned red hands the next reviewer the command of its entity\'s red gate', async () => {
    harness = entitiesHarness(null, MOVED_BRANCH);
    const review = harness.board.launchJob({
      kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, '2026-10-28T10:00:00+01:00');
    harness.board.endJob(review.job.id, { outcome: 'reviewed' }, '2026-10-28T10:00:00+01:00');
    harness.settings.gateOutcome = 'failed';
    harness.settings.gateStep    = 'verify';
    harness.settings.gateEntity  = 'shop';

    await harness.slots.sweep();

    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(redHandoffCommandIn(join(harness.repository, '.example-tracker', 'jobs', review.job.id, 'stale-green'))).toBe('bun run verify:shop');
  });
});
