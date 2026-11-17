/**
 * What a crossing ticket's builder is told, from the launch facts the DrivePass reads off the board and the job folders, worded as the
 * Overseer words them. What matters: `adapt` that takes up the stage 1 session after the package stages gets the adapt message, with the
 * sealed packages, their reviews, `package-return` and the Acceptance evidence, and is never told a review did not hold (A2); after a home
 * review that did not hold, `adapt` resumes with that review's findings, followed by the rules of the adapt stage, both when `adapt` was
 * skipped, so the session never heard them, and when it ran (E51); a package build that its package review sent back is told that review,
 * which the ticket does not hold, in a resumed session and in a fresh one (E34).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path, { join }              from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                                 from '../../src/lib/tracker-model/@types/Job.ts';
import type { JobOutcome }                          from '../../src/lib/tracker-model/@types/Job.ts';
import type { TicketStage }                         from '../../src/lib/tracker-model/@types/Task.ts';
import type { Board }                               from '../../src/lib/tracker-model/Board.ts';
import { CrossingStages }                           from '../../src/services/overseer/CrossingStages.ts';
import { launchFactsOf, type DrivePassRequest }     from '../../src/services/overseer/DrivePass.ts';
import { branchNamesOf }                            from '../../src/shared/BranchNames.ts';
import { resourceFilePathOf }                       from '../../src/shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }                            from '../../src/shared/constants/ProductNames.ts';
import { boardFixture, taskFixture, ticketFixture } from '../../src/testing/BoardFixtures.ts';
import {
  ENTITY_FORGE_ENTITIES,
  ENTITY_FORGE_MAIN_LINE,
  ENTITY_FORGE_TICKETS,
  entityForgePipelineOf
} from '../../src/testing/EntityForgeFixture.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { OverseerWording }                                from './OverseerWording.ts';

const AT = '2026-11-17T17:00:00+01:00';
const { SHOP, UI_KIT } = ENTITY_FORGE_ENTITIES;
const { SHOP_TICKET } = ENTITY_FORGE_TICKETS;
const BUILD_PROMPT = readFileSync(resourceFilePathOf('prompts', 'BuildPrompt.md'), 'utf8');
const PLACEHOLDER = /\{\{\w+\}\}/;
const HOME_REVIEW_SECTION = '## Review 1\n\nThe basket shows the total in euros.\n\n- A1 does-not-hold — The total is in euros.';
const PACKAGE_REVIEW_SECTION = '## Review 1\n\nThe export breaks.\n\n- A1 does-not-hold — The example part breaks.';

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

interface StageJob {
  kind:   'build' | 'review';
  entity: string;
  stage:  number;
}

const SHOP_BUILD: StageJob       = { kind: 'build', entity: SHOP.key, stage: 1 };
const PACKAGE_BUILDER: StageJob  = { kind: 'build', entity: UI_KIT.key, stage: 2 };
const PACKAGE_REVIEWER: StageJob = { kind: 'review', entity: UI_KIT.key, stage: 3 };
const ADAPT_BUILD: StageJob      = { kind: 'build', entity: SHOP.key, stage: 4 };
const HOME_REVIEWER: StageJob    = { kind: 'review', entity: SHOP.key, stage: 5 };

const ADAPT: TicketStage = { name: 'adapt', entity: SHOP.key };

interface CrossingBoard {
  board:            Board;
  trackerDirectory: string;
}

const ACCEPTANCE = '## Acceptance\nA1. Example basket total.\n';

/** The shop's crossing ticket on the entity-forge pipeline, its row in `stage` and its body `body`, with a scratch tracker folder. */
function crossingBoardOf(stage: TicketStage, body: string = ACCEPTANCE): CrossingBoard {
  const repository = createScratchDirectory('crossing-launch-facts');
  folders.push(repository);
  const trackerDirectory = join(repository, PRODUCT_NAMES.DATA_FOLDER);
  mkdirSync(trackerDirectory, { recursive: true });
  const { board } = boardFixture({
    pipeline: entityForgePipelineOf('shop-crosses-into-ui-kit'),
    tasks:    [taskFixture({
      id: 1, ticket: SHOP_TICKET.id, status: 'in-progress', stage
    })],
    tickets: [{
      ...ticketFixture({
        id: SHOP_TICKET.id, status: 'in-progress', task: 1, entity: SHOP.key
      }),
      body,
    }],
  });
  return { board, trackerDirectory };
}

function launchedJobOf(board: Board, stageJob: StageJob, attempt: number = 1): Readonly<Job> {
  return board.launchJob({
    kind:        stageJob.kind,
    role:        stageJob.kind === 'build' ? 'builder' : 'reviewer',
    ticketIds:   [SHOP_TICKET.id],
    parentJobId: null,
    attempt,
    target:      ENTITY_FORGE_MAIN_LINE,
    entity:      stageJob.entity,
    stage:       stageJob.stage,
  }, AT).job;
}

function endedJobOf(board: Board, stageJob: StageJob, outcome: JobOutcome): Readonly<Job> {
  const job = launchedJobOf(board, stageJob);
  board.endJob(job.id, { outcome }, AT);
  return job;
}

/** Stage 1 built, then the package build and its review that held and sealed the package, `exposedSurfaceChanged` as stated and confirmed. */
function packageStagesSealed(crossing: CrossingBoard, exposedSurfaceChanged: boolean): void {
  const { board, trackerDirectory } = crossing;
  endedJobOf(board, SHOP_BUILD, 'built');
  const packageBuild = endedJobOf(board, PACKAGE_BUILDER, 'built');
  CrossingStages.writeStageStatement(trackerDirectory, packageBuild.id, { stage: 'package-build', exposedSurfaceChanged });
  const packageReview = endedJobOf(board, PACKAGE_REVIEWER, 'reviewed');
  CrossingStages.writeStageStatement(trackerDirectory, packageReview.id, {
    stage: 'package-review', exposedSurfaceConfirmed: true, reviewText: 'The export now returns cents.', sealedReachPaths: []
  });
  board.sealTicketPackage(SHOP_TICKET.id, UI_KIT.key, 'example-seal', AT);
}

/** The launch facts the DrivePass reads for `job`, worded as the Overseer words them. */
function firstMessageOf(crossing: CrossingBoard, job: Readonly<Job>): string {
  const { trackerDirectory } = crossing;
  const request = {
    workspace:     { rootDirectory: join(trackerDirectory, '..'), trackerDirectory, ticketsDirectory: join(trackerDirectory, 'tickets') },
    platformPorts: {
      shellLine:       { displayLineOf: () => 'bun test', lineGrammar: 'posix' },
      gateConfinement: { workerConfinement: () => 'confined' },
      dataFolders:     { pathModule: path, foldsCase: false },
    },
    branchNames: branchNamesOf(null),
    mainLine:    ENTITY_FORGE_MAIN_LINE,
  } as unknown as Pick<DrivePassRequest, 'workspace' | 'platformPorts' | 'branchNames' | 'mainLine'>;
  const place = {
    checkout: '', workingDirectory: '', holdsRepository: true, projectFolderFromStart: ''
  };
  const facts = launchFactsOf(crossing.board, request, job, { instructions: BUILD_PROMPT, airlock: null, place });
  return OverseerWording.launchTextOf(job, facts).firstMessage;
}

describe('stage 4, adapt, after the package stages', () => {
  test('takes up the stage 1 session with the adapt message, never told that a review did not hold (A2)', () => {
    const crossing = crossingBoardOf(ADAPT);
    packageStagesSealed(crossing, true);

    const message = firstMessageOf(crossing, launchedJobOf(crossing.board, ADAPT_BUILD));

    expect(message.startsWith('The package stages of #001 are complete. Your session of stage 1 continues.')).toBe(true);
    expect(message).toContain(`### The package \`${UI_KIT.key}\`\n\nWhat the package exposes changed from the proposal.\n\nThe export now returns cents.`);
    expect(message).toContain(`- The change of the ticket in \`${UI_KIT.key}\` is sealed.`);
    expect(message).toContain('End with the outcome `package-return`.');
    expect(message).toContain('This stage owns the evidence for the Acceptance of the ticket.');
    expect(message).not.toContain('does not hold');
    expect(message).not.toMatch(PLACEHOLDER);
  });
});

describe('stage 4, adapt, after a home review that did not hold (E51)', () => {
  test('E51: when adapt was skipped, resumes the stage 1 session with the review\'s findings and the rules of the adapt stage', () => {
    const crossing = crossingBoardOf(ADAPT, `${ACCEPTANCE}\n${HOME_REVIEW_SECTION}\n`);
    packageStagesSealed(crossing, false);
    endedJobOf(crossing.board, HOME_REVIEWER, 'does-not-hold');

    const message = firstMessageOf(crossing, launchedJobOf(crossing.board, ADAPT_BUILD));

    expect(message.startsWith('The review of #001 found a claim that does not hold, so your session is resumed with its findings')).toBe(true);
    expect(message).toContain(`${HOME_REVIEW_SECTION}\n\nYour session continues as stage 4 of ticket #001: adapt.`);
    expect(message).toContain(`- The change of the ticket in \`${UI_KIT.key}\` is sealed. Do not change the files of these packages.`);
    expect(message).toContain('End with the outcome `package-return`.');
    expect(message).not.toMatch(PLACEHOLDER);
  });

  test('E51: when adapt ran, resumes its session with the review\'s findings and the rules of the adapt stage', () => {
    const crossing = crossingBoardOf(ADAPT, `${ACCEPTANCE}\n${HOME_REVIEW_SECTION}\n`);
    packageStagesSealed(crossing, true);
    endedJobOf(crossing.board, ADAPT_BUILD, 'built');
    endedJobOf(crossing.board, HOME_REVIEWER, 'does-not-hold');

    const message = firstMessageOf(crossing, launchedJobOf(crossing.board, ADAPT_BUILD));

    expect(message.startsWith('The review of #001 found a claim that does not hold, so your session is resumed with its findings')).toBe(true);
    expect(message).toContain(HOME_REVIEW_SECTION);
    expect(message).toContain(`- The change of the ticket in \`${UI_KIT.key}\` is sealed.`);
    expect(message).not.toContain('The package stages of #001 are complete.');
  });
});

describe('stage 2, a package build its package review sent back (E34)', () => {
  /** Stage 1 and the package build built; the package review did not hold and kept its Review. */
  function packageReviewDidNotHold(): CrossingBoard {
    const crossing = crossingBoardOf({ name: 'package-build', entity: UI_KIT.key });
    endedJobOf(crossing.board, SHOP_BUILD, 'built');
    endedJobOf(crossing.board, PACKAGE_BUILDER, 'built');
    const packageReview = endedJobOf(crossing.board, PACKAGE_REVIEWER, 'does-not-hold');
    CrossingStages.writeStageStatement(crossing.trackerDirectory, packageReview.id, { stage: 'package-review-findings', reviewSection: PACKAGE_REVIEW_SECTION });
    return crossing;
  }

  test('E34: the resumed package builder is told the package review\'s findings, which the ticket does not hold', () => {
    const crossing = packageReviewDidNotHold();

    const message = firstMessageOf(crossing, launchedJobOf(crossing.board, PACKAGE_BUILDER));

    expect(message.startsWith('The review of #001 found a claim that does not hold, so your session is resumed with its findings')).toBe(true);
    expect(message).toContain(PACKAGE_REVIEW_SECTION);
  });

  test('E34: a fresh package builder gets the package review\'s findings before the rules of its stage', () => {
    const crossing = packageReviewDidNotHold();

    const message = firstMessageOf(crossing, launchedJobOf(crossing.board, PACKAGE_BUILDER, 2));

    expect(message.startsWith(`## Why the package build of \`${UI_KIT.key}\` runs again`)).toBe(true);
    expect(message.indexOf(PACKAGE_REVIEW_SECTION)).toBeLessThan(message.indexOf('This job is stage 2 of ticket #001'));
    expect(message).not.toMatch(PLACEHOLDER);
  });
});
