/**
 * One crossing end to end on the entity-forge fixture, its pipeline read from the stored `pipeline.json` with the shop whitelisting the
 * package `ui-kit`. What matters: the reader accepts the whitelist, and one ticket of the shop then runs every stage on one board, each job
 * launched by the Playbook from the row's stage alone, verified by Customs against the fixture's recorded git and gated green by the
 * manifest the Overseer writes for it: stage 1 crosses into the package, the package build states a change of what the package exposes,
 * the package review confirms it and seals the package change, `adapt` keeps the seal, and the home review queues the ticket, whose
 * Airlock gates the shop, the admin app and the package and lands it. Each stage case on its own is in `JobLaunch.crossing.spec.ts`, and
 * each landing case in `Airlocks.crossing.spec.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path, { join }               from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { PipelineFile }     from '../../adapters/pipeline/PipelineFile.ts';
import type { Job }         from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }    from '../../lib/tracker-model/@types/Pipeline.ts';
import type { TicketStage } from '../../lib/tracker-model/@types/Task.ts';
import type { Board }       from '../../lib/tracker-model/Board.ts';
import { branchNamesOf }    from '../../shared/BranchNames.ts';
import { LIFECYCLE_LIMITS } from '../../shared/constants/LifecycleLimits.ts';
import { PRODUCT_NAMES }    from '../../shared/constants/ProductNames.ts';
import {
  ENTITY_FORGE_ENTITIES,
  ENTITY_FORGE_MAIN_LINE,
  ENTITY_FORGE_TICKETS,
  entityForgePipelineTextOf,
  sourceFileOf
} from '../../testing/EntityForgeFixture.ts';
import { stepIn }                                                                    from '../../testing/RecordedAirlockGit.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit }                    from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }                            from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                                 from '../../testing/ToolGuard.ts';
import type { JobLaunchContext }                                                     from './JobLaunch.ts';
import { AirlockAnswerSets }                                                         from './testing/AirlockAnswerSets.ts';
import { createRecordedAirlocksHarness, RECORDED_AIRLOCK_IDS, type AirlocksHarness } from './testing/AirlocksHarness.ts';
import {
  CrossingStageRun,
  type CrossingStagePlace,
  type StageJob,
  type StageRun
} from './testing/CrossingStageRun.ts';

const AT = '2026-11-17T19:00:00+01:00';
const { SHOP, ADMIN, UI_KIT } = ENTITY_FORGE_ENTITIES;
const { SHOP_TICKET } = ENTITY_FORGE_TICKETS;
const SHOP_TICKET_BODY = '## Acceptance\n\nA1. The shop shows the basket total with the shared parts.\n\n## Brief\n\nAlex Example wants the total.\n';

const recordedGit = useRecordedGit();
const {
  stageRunOf, builtReportOf, reviewedReportOf, verifiedStageJobOf
} = CrossingStageRun;

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

/** The fixture's pipeline in which the shop whitelists the package, stored as `pipeline.json` and read back as the board reads it. */
function storedCrossingPipelineOf(repository: string): Pipeline {
  const pipelineFilePath = join(repository, 'pipeline.json');
  writeFileSync(pipelineFilePath, entityForgePipelineTextOf('shop-crosses-into-ui-kit'));
  const reading = PipelineFile.read(pipelineFilePath);
  if (reading.verdict !== 'readable') throw new Error(`the stored pipeline is ${reading.verdict}`);
  return reading.pipeline;
}

/** The jobs of the ticket that one pass of the Playbook launched. */
function launchedByThePlaybook(board: Board): Readonly<Job>[] {
  board.followPlaybook({ ...LIFECYCLE_LIMITS, now: AT, usageResetsAt: null }, {
    mainLine:                     ENTITY_FORGE_MAIN_LINE,
    groupTargetPrefix:            'group-',
    installVersionChanged:        false,
    targetsHoldingManagedBlock:   [],
    ticketIdsTouchingAgentConfig: [],
    closedDeliveryTurns:          [],
    budgetSpentDeliveryTurns:     [],
    assistantHasAnswered:         false,
    assistantBootRetryDue:        false,
  }, () => ({ questions: [], context: '' }));
  return board.jobs().filter((job) => job.state === 'launching' && job.ticketIds.includes(SHOP_TICKET.id));
}

function stageJobOf(job: Readonly<Job>): StageJob {
  return { kind: job.kind === 'review' ? 'review' : 'build', entity: job.entity ?? '', stage: job.stage ?? 0 };
}

function contextOf(repository: string): JobLaunchContext {
  const trackerDirectory = join(repository, PRODUCT_NAMES.DATA_FOLDER);
  mkdirSync(trackerDirectory, { recursive: true });
  return {
    workspace:         { rootDirectory: repository, trackerDirectory, ticketsDirectory: join(trackerDirectory, 'tickets') },
    mainLine:          ENTITY_FORGE_MAIN_LINE,
    branchNames:       branchNamesOf(null),
    log:               () => undefined,
    platformPorts:     { dataFolders: { pathModule: path, foldsCase: false } },
    decisionWordingOf: () => ({ questions: [], context: '' }),
  } as unknown as JobLaunchContext;
}

const PACKAGE_REVIEW: TicketStage = { name: 'package-review', entity: UI_KIT.key };
const ADAPT: TicketStage          = { name: 'adapt', entity: SHOP.key };
const HOME_REVIEW: TicketStage    = { name: 'review', entity: SHOP.key };

describeWhenGitIsRecorded('a ticket of the shop that crosses into the whitelisted package', () => {
  test('runs stages 1 to 5, each launched by the Playbook, and lands, gated by the shop, the admin app and the package', async () => {
    const pipelineFolder = createScratchDirectory('entity-forge-crossing-pipeline');
    const pipeline = storedCrossingPipelineOf(pipelineFolder);
    removeScratchDirectory(pipelineFolder);
    expect(pipeline.entities?.[SHOP.key]?.whitelist).toEqual([UI_KIT.key]);

    const shopTicket = {
      id: SHOP_TICKET.id, entity: SHOP.key, status: 'pending' as const, body: SHOP_TICKET_BODY
    };
    harness = createRecordedAirlocksHarness([shopTicket], {}, true, null, false, null, pipeline.entities);
    const { board } = harness;
    board.setOverseerState('running', AT);
    const place: CrossingStagePlace = {
      board,
      context:       contextOf(harness.repository),
      repository:    harness.repository,
      ticketId:      SHOP_TICKET.id,
      enterScenario: recordedGit.enterScenario,
      at:            AT,
      gatedTreeId:   RECORDED_AIRLOCK_IDS.TICKET_TREE,
    };
    const acceptance = [{ item: 'A1', state: 'met', evidence: 'ExampleBasket.spec.ts' }];
    const homeReviewClaims = [{
      item: 'A1', result: 'holds', handoffContradicted: false, note: 'Example probe.'
    }];
    const stageRuns: StageRun[] = [
      stageRunOf('SHOP_TICKET_INTO_UI_KIT', '<start>', builtReportOf({ acceptance })),
      stageRunOf('SHOP_TICKET_INTO_UI_KIT', '<shop ticket tip>', builtReportOf({ acceptance, exposedSurfaceChanged: true })),
      stageRunOf('SHOP_TICKET_PACKAGE_RESHAPED', '<shop ticket tip>', reviewedReportOf({ exposedSurfaceConfirmed: true })),
      stageRunOf('SHOP_TICKET_RESHAPED_ADAPTED', '<stage tip>', builtReportOf({ acceptance })),
      stageRunOf('SHOP_TICKET_ADAPTED_REVIEWED', '<adapt tip>', reviewedReportOf({ claims: homeReviewClaims })),
    ];
    const launchedStageJobs: StageJob[][] = [];
    const outcomes: string[] = [];
    const stagesAfterEachRun: (TicketStage | null)[] = [];
    for (const run of stageRuns) {
      const launched = launchedByThePlaybook(board);
      launchedStageJobs.push(launched.map(stageJobOf));
      const [job] = launched;
      if (job === undefined) break;
      outcomes.push(verifiedStageJobOf(place, job, run).whereTheJobWent);
      stagesAfterEachRun.push(board.ticketStageOf(SHOP_TICKET.id));
    }

    expect(launchedStageJobs).toEqual([
      [{ kind: 'build', entity: SHOP.key, stage: 1 }],
      [{ kind: 'build', entity: UI_KIT.key, stage: 2 }],
      [{ kind: 'review', entity: UI_KIT.key, stage: 3 }],
      [{ kind: 'build', entity: SHOP.key, stage: 4 }],
      [{ kind: 'review', entity: SHOP.key, stage: 5 }],
    ]);
    expect(outcomes).toEqual(['built: ', 'built: ', 'reviewed: ', 'built: ', 'reviewed: ']);
    expect(stagesAfterEachRun).toEqual([{ name: 'package-build', entity: UI_KIT.key }, PACKAGE_REVIEW, ADAPT, HOME_REVIEW, HOME_REVIEW]);
    expect(launchedByThePlaybook(board)).toEqual([]);
    expect(Object.keys(board.ticketSealsOf(SHOP_TICKET.id))).toEqual([UI_KIT.key]);

    const landing = AirlockAnswerSets.mainLineAnswersOf({
      ticketId:      SHOP_TICKET.id,
      repository:    harness.repository,
      worktree:      harness.worktreeOf(SHOP_TICKET.id),
      beforeLanding: [stepIn(harness.worktreeOf(SHOP_TICKET.id), {
        gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', RECORDED_AIRLOCK_IDS.MAIN_TIP, '--'],
        answeredAs:   GIT_CALL_SHAPES.FILES_CHANGED_UP_TO_A_COMMIT,
        filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: sourceFileOf(UI_KIT) },
      })],
    });
    recordedGit.answerFrom(landing.beforeTheMergeIn);
    await harness.slots.sweep();

    expect(harness.gatedEntities.map((entityKeys) => [...entityKeys ?? []].sort())).toEqual([[ADMIN.key, SHOP.key, UI_KIT.key].sort()]);
    expect(board.tickets().find((ticket) => ticket.frontmatter.id === SHOP_TICKET.id)?.frontmatter.status).toBe('delivered');
  });
});
