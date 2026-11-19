/**
 * The Overseer's view of a crossing ticket's stages on the entity-forge fixture's pipeline where the shop whitelists `ui-kit`. What
 * matters: only stage 1 of an entity with a whitelist may write a proposal; the branch's paths are sorted by owner and only whitelisted
 * owners are crossed, a package before the packages that consume it; after a package review, a package stage 1 changed that the
 * whitelist no longer names stays crossed, so its build opens `whitelist-removed-mid-crossing`, but not one whose build refused (E19); a
 * seal covers a package's homes but not a deeper home of another entity (E2), and the `reach` paths its package stages changed (E3),
 * which Customs judges every later job on; `adapt` is skipped only when
 * every crossed package's build stated no change of what it exposes and its review confirmed it, a missing statement counting as a change
 * (E40); each stage's session is told its stage, the package review the build's statement, `adapt` each package's confirmed statement
 * and review, the home review each package's review (E32); a stage's run starts at its first job, a retry after a failed one included, and
 * a package review's run at its package's first build; and a stage statement that cannot be read counts as none.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                                       from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }                                  from '../../lib/tracker-model/@types/Pipeline.ts';
import type { TicketStage }                               from '../../lib/tracker-model/@types/Task.ts';
import { boardFixture, taskFixture, ticketFixture }       from '../../testing/BoardFixtures.ts';
import { ENTITY_FORGE_ENTITIES, entityForgePipelineOf }   from '../../testing/EntityForgeFixture.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { CrossingStages, type PackageStageStatements }    from './CrossingStages.ts';
import { jobFolderIn }                                    from './OverseerFiles.ts';

const AT = '2026-11-17T18:30:00+01:00';
const { SHOP, ADMIN, UI_KIT } = ENTITY_FORGE_ENTITIES;
const CROSSING_PIPELINE = entityForgePipelineOf('shop-crosses-into-ui-kit');

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

function jobOf(entity: string, stage: number): Readonly<Pick<Job, 'entity' | 'stage'>> {
  return { entity, stage };
}

/** The pipeline with a second package, `example-icons`, that `ui-kit` consumes, whitelisted by the shop beside `ui-kit`. */
function pipelineWithTwoPackages(): Pipeline {
  const entities = CROSSING_PIPELINE.entities ?? {};
  const uiKit = entities[UI_KIT.key];
  const shop = entities[SHOP.key];
  if (uiKit === undefined || shop === undefined) throw new Error('The fixture names the shop and ui-kit.');
  return {
    ...CROSSING_PIPELINE,
    entities: {
      ...entities,
      [SHOP.key]:      { ...shop, whitelist: [UI_KIT.key, 'example-icons'] },
      [UI_KIT.key]:    { ...uiKit, dependsOn: ['example-icons'] },
      'example-icons': { ...uiKit, home: ['/packages/ui-kit/icons'] },
    },
  };
}

describe('a proposal and a crossing', () => {
  test('only stage 1 of an entity with a whitelist may write a proposal, in the whitelisted package\'s homes', () => {
    expect(CrossingStages.proposalHomesOf(CROSSING_PIPELINE, jobOf(SHOP.key, 1))).toEqual([`/${UI_KIT.homeFolder}`]);
    expect(CrossingStages.proposalHomesOf(CROSSING_PIPELINE, jobOf(SHOP.key, 4))).toEqual([]);
    expect(CrossingStages.proposalHomesOf(CROSSING_PIPELINE, jobOf(ADMIN.key, 1))).toEqual([]);
  });

  test('crosses only into whitelisted owners of the changed paths', () => {
    const changedPaths = [`${SHOP.homeFolder}/src/Example.ts`, `${UI_KIT.homeFolder}/src/Example.ts`, `${ADMIN.homeFolder}/src/Example.ts`, 'bun.lock'];

    expect(CrossingStages.crossedPackagesOf(CROSSING_PIPELINE, SHOP.key, changedPaths)).toEqual([UI_KIT.key]);
    expect(CrossingStages.crossedPackagesOf(CROSSING_PIPELINE, SHOP.key, [`${SHOP.homeFolder}/src/Example.ts`])).toEqual([]);
    expect(CrossingStages.crossedPackagesOf(CROSSING_PIPELINE, ADMIN.key, changedPaths)).toEqual([]);
  });

  test('runs a package before the package that consumes it, and a seal leaves out a deeper home of another entity (E2)', () => {
    const pipeline = pipelineWithTwoPackages();
    const changedPaths = [`${UI_KIT.homeFolder}/src/Example.ts`, `${UI_KIT.homeFolder}/icons/Example.ts`];

    expect(CrossingStages.crossedPackagesOf(pipeline, SHOP.key, changedPaths)).toEqual(['example-icons', UI_KIT.key]);
    expect(CrossingStages.sealPathspecsOf(pipeline, UI_KIT.key)).toEqual([UI_KIT.homeFolder, `:(exclude)${UI_KIT.homeFolder}/icons`]);
    expect(CrossingStages.sealPathspecsOf(pipeline, 'example-icons')).toEqual([`${UI_KIT.homeFolder}/icons`]);
  });

  test('E19: after a package review, a package stage 1 changed that the whitelist no longer names stays crossed; a refused one does not', () => {
    const twoPackages = pipelineWithTwoPackages();
    const shop = twoPackages.entities?.[SHOP.key];
    if (shop === undefined) throw new Error('The fixture names the shop.');
    const pipeline: Pipeline = { ...twoPackages, entities: { ...twoPackages.entities, [SHOP.key]: { ...shop, whitelist: ['example-icons'] } } };
    const { board } = boardFixture({ pipeline, tickets: [ticketFixture({ id: '001', status: 'in-progress', entity: SHOP.key })] });
    const changedPaths = [`${SHOP.homeFolder}/src/Example.ts`, `${UI_KIT.homeFolder}/src/Example.ts`, `${UI_KIT.homeFolder}/icons/Example.ts`];

    expect(CrossingStages.crossedPackagesOf(pipeline, SHOP.key, changedPaths, CrossingStages.ticketWhitelistOf(board, '001', SHOP.key))).toEqual(['example-icons']);
    expect(CrossingStages.packagesCrossedAfterAPackageReviewOf(board, '001', SHOP.key, changedPaths)).toEqual(['example-icons', UI_KIT.key]);

    const refused = board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main', entity: UI_KIT.key, stage: 2
    }, AT).job;
    board.endJob(refused.id, { outcome: 'refused' }, AT);
    expect(CrossingStages.packagesCrossedAfterAPackageReviewOf(board, '001', SHOP.key, changedPaths)).toEqual(['example-icons']);
  });

  test('a seal also covers the `reach` paths its package stages changed (E3)', () => {
    expect(CrossingStages.sealPathspecsOf(pipelineWithTwoPackages(), UI_KIT.key, ['bun.lock']))
      .toEqual([UI_KIT.homeFolder, 'bun.lock', `:(exclude)${UI_KIT.homeFolder}/icons`]);
  });
});

function statementsOf(exposedSurfaceChanged: boolean | null, exposedSurfaceConfirmed: boolean | null): PackageStageStatements {
  return {
    entity: UI_KIT.key, exposedSurfaceChanged, exposedSurfaceConfirmed, reviewText: '', sealedReachPaths: []
  };
}

describe('skipping adapt (E40)', () => {
  test.each([
    ['no change stated and confirmed', [statementsOf(false, true)], true],
    ['a change stated and confirmed', [statementsOf(true, true)], false],
    ['no change stated, corrected by the review', [statementsOf(false, false)], false],
    ['no statement of the build', [statementsOf(null, true)], false],
    ['no confirmation of the review', [statementsOf(false, null)], false],
    ['one of two packages changed', [statementsOf(false, true), { ...statementsOf(true, true), entity: 'example-icons' }], false],
    ['no crossed package', [], false],
  ] as const)('%s: skipped %p', (_name, statements, skipped) => {
    expect(CrossingStages.adaptIsSkipped(statements)).toBe(skipped);
  });

  test.each([
    [false, true, false],
    [true, true, true],
    [false, false, true],
    [true, false, false],
    [null, true, true],
  ] as const)('a build stating %p, confirmed %p, tells adapt that what the package exposes changed: %p', (stated, confirmed, changed) => {
    expect(CrossingStages.confirmedExposedSurfaceChangedOf(statementsOf(stated, confirmed))).toBe(changed);
  });
});

/** The shop's ticket with its row in `stage`, `ui-kit` sealed, and its package stages' jobs logged and ended. */
function crossingBoardOf(stage: TicketStage) {
  const trackerDirectory = createScratchDirectory('crossing-stages');
  folders.push(trackerDirectory);
  const { board } = boardFixture({
    pipeline: CROSSING_PIPELINE,
    tasks:    [taskFixture({
      id: 1, ticket: '001', status: 'in-progress', stage, seals: { [UI_KIT.key]: 'example-seal' }
    })],
    tickets: [ticketFixture({
      id: '001', status: 'in-progress', task: 1, entity: SHOP.key
    })],
  });
  const packageBuild = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main', entity: UI_KIT.key, stage: 2
  }, AT).job;
  CrossingStages.writeStageStatement(trackerDirectory, packageBuild.id, { stage: 'package-build', exposedSurfaceChanged: false });
  board.endJob(packageBuild.id, { outcome: 'built' }, AT);
  const packageReview = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main', entity: UI_KIT.key, stage: 3
  }, AT).job;
  CrossingStages.writeStageStatement(trackerDirectory, packageReview.id, {
    stage: 'package-review', exposedSurfaceConfirmed: false, reviewText: 'Example review.', sealedReachPaths: ['bun.lock']
  });
  board.endJob(packageReview.id, { outcome: 'reviewed' }, AT);
  return { board, trackerDirectory };
}

function launchedJobOf(board: ReturnType<typeof crossingBoardOf>['board'], kind: 'build' | 'review', entity: string, stage: number): Readonly<Job> {
  return board.launchJob({
    kind, role: kind === 'build' ? 'builder' : 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main', entity, stage
  }, AT).job;
}

describe('what each stage\'s session is told', () => {
  test('stage 1 of the shop is told the package it may write a proposal in', () => {
    const { board, trackerDirectory } = crossingBoardOf({ name: 'build', entity: SHOP.key });

    expect(CrossingStages.crossingStageFactsOf(board, trackerDirectory, launchedJobOf(board, 'build', SHOP.key, 1), false))
      .toEqual({ stage: 'build', whitelistedPackages: [UI_KIT.key] });
  });

  test('the package build is told its home entity, the package review also the build\'s statement', () => {
    const { board, trackerDirectory } = crossingBoardOf({ name: 'package-review', entity: UI_KIT.key });

    expect(CrossingStages.crossingStageFactsOf(board, trackerDirectory, launchedJobOf(board, 'review', UI_KIT.key, 3), false))
      .toEqual({ stage: 'package-review', homeEntity: SHOP.key, exposedSurfaceChanged: false });
  });

  test('adapt is told each sealed package with its statement as the review corrected it, and its review', () => {
    const { board, trackerDirectory } = crossingBoardOf({ name: 'adapt', entity: SHOP.key });

    expect(CrossingStages.crossingStageFactsOf(board, trackerDirectory, launchedJobOf(board, 'build', SHOP.key, 4), true)).toEqual({
      stage:           'adapt',
      crossedPackages: [{ entity: UI_KIT.key, exposedSurfaceChanged: true, reviewText: 'Example review.' }],
      resumesSession:  true,
    });
  });

  test('the home review is told the sealed packages, each with its review (E32)', () => {
    const { board, trackerDirectory } = crossingBoardOf({ name: 'review', entity: SHOP.key });

    expect(CrossingStages.crossingStageFactsOf(board, trackerDirectory, launchedJobOf(board, 'review', SHOP.key, 5), false))
      .toEqual({ stage: 'review', crossedPackages: [{ entity: UI_KIT.key, reviewText: 'Example review.' }] });
  });

  test('Customs judges a later job on the pathspecs the package review sealed, its `reach` paths among them (E3)', () => {
    const { board, trackerDirectory } = crossingBoardOf({ name: 'adapt', entity: SHOP.key });

    const sealedChange = { entity: UI_KIT.key, pathspecs: [UI_KIT.homeFolder, 'bun.lock'], seal: 'example-seal' };

    expect(CrossingStages.crossingStageScopeOf(board, trackerDirectory, launchedJobOf(board, 'build', SHOP.key, 4))).toEqual({ stageName: 'adapt', seals: [sealedChange] });
  });

  test('a job of an entity that whitelists nothing, and a job without an entity, are told nothing of a stage', () => {
    const { board, trackerDirectory } = crossingBoardOf({ name: 'build', entity: SHOP.key });

    expect(CrossingStages.crossingStageFactsOf(board, trackerDirectory, launchedJobOf(board, 'build', ADMIN.key, 1), false)).toBeNull();
    const withoutEntity = board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, AT).job;
    expect(CrossingStages.crossingStageFactsOf(board, trackerDirectory, withoutEntity, false)).toBeNull();
  });
});

describe('the run of a stage', () => {
  test('starts at the first job of the stage, so a retry after a failed one answers for its commits; another stage starts its own', () => {
    const { board } = crossingBoardOf({ name: 'package-build', entity: UI_KIT.key });
    const failedBuild = launchedJobOf(board, 'build', UI_KIT.key, 2);
    board.endJob(failedBuild.id, { outcome: 'failed', cause: 'changed-outside-home-and-reach' }, AT);
    const retry = launchedJobOf(board, 'build', UI_KIT.key, 2);

    expect(CrossingStages.stageRunStartJobIdOf(board.logRecordsSoFar(), retry)).toBe(failedBuild.id);
    expect(CrossingStages.stageRunStartJobIdOf(board.logRecordsSoFar(), failedBuild)).toBe(failedBuild.id);
  });

  test('of a package review starts at its package\'s first build since another stage ran', () => {
    const { board } = crossingBoardOf({ name: 'package-review', entity: UI_KIT.key });
    const adapt = launchedJobOf(board, 'build', SHOP.key, 4);
    board.endJob(adapt.id, { outcome: 'built' }, AT);
    const packageBuild = launchedJobOf(board, 'build', UI_KIT.key, 2);
    board.endJob(packageBuild.id, { outcome: 'built' }, AT);
    const packageReview = launchedJobOf(board, 'review', UI_KIT.key, 3);

    expect(CrossingStages.packageRunStartJobIdOf(board.logRecordsSoFar(), packageReview)).toBe(packageBuild.id);
    expect(CrossingStages.stageRunStartJobIdOf(board.logRecordsSoFar(), packageReview)).toBe(packageReview.id);
  });
});

describe('a stage statement', () => {
  test('that cannot be read, or is not one, counts as none', () => {
    const trackerDirectory = createScratchDirectory('crossing-statements');
    folders.push(trackerDirectory);
    const jobFolder = jobFolderIn(trackerDirectory, 'J7');
    mkdirSync(jobFolder, { recursive: true });

    expect(CrossingStages.stageStatementOf(trackerDirectory, 'J7')).toBeNull();
    writeFileSync(join(jobFolder, 'stage-statement.json'), '{"stage":"package-build","exposedSurfaceChanged":"no"}\n');
    expect(CrossingStages.stageStatementOf(trackerDirectory, 'J7')).toBeNull();
    writeFileSync(join(jobFolder, 'stage-statement.json'), '{ not json');
    expect(CrossingStages.stageStatementOf(trackerDirectory, 'J7')).toBeNull();
  });

  test('of a package review that names no `reach` path seals none', () => {
    const trackerDirectory = createScratchDirectory('crossing-statements');
    folders.push(trackerDirectory);
    const jobFolder = jobFolderIn(trackerDirectory, 'J8');
    mkdirSync(jobFolder, { recursive: true });
    writeFileSync(join(jobFolder, 'stage-statement.json'), '{"stage":"package-review","exposedSurfaceConfirmed":true,"reviewText":""}\n');

    expect(CrossingStages.stageStatementOf(trackerDirectory, 'J8')).toEqual({
      stage: 'package-review', exposedSurfaceConfirmed: true, reviewText: '', sealedReachPaths: []
    });
  });
});
