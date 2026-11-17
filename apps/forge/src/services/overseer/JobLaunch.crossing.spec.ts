/**
 * A ticket of the shop that crosses into the package `ui-kit`, stage by stage, on the entity-forge fixture with the shop whitelisting the
 * package: each stage job verified by Customs against the fixture's recorded git, gated green and settled. What matters, by strategy 5.2 to
 * 5.6: stage 1 may write a proposal in the whitelisted package, and once gated, the paths its branch changed are sorted by owner, so the
 * package's build is the next stage and the ticket stays in progress; a branch that stayed in the shop settles as it always has (E10); a
 * change to an entity that is neither home nor whitelisted is still sent back (E11); a stage 1 that changed only the package is sent back
 * as work of another entity (E15). The package build answers only for its own commits, may commit nothing (E20) or reshape the package
 * (E21), is sent back for a change outside the package, then fails, also when all its commits lie outside the package, which is no work of
 * another entity (E23), and a retry still answers for the failed job's commits; it must state what the package exposes (E40). Its gate run
 * checks the package, then the package's dependents but the home, and a red one is its red handoff (E25, E26); a dependent's gate still red
 * once the resumes are spent ends the job and opens `dependent-broken`, while the package's own goes the red handoff's way. The package
 * review settles its rounds and record as any review: it may fix in the package (E30), is granted a round by the package's re-review (E31),
 * and one that does not hold sends the package build back (E34); one that holds seals the ticket's own change to the package, a lockfile
 * change of its stages among it (E3), and runs the home review when the build stated no change of what the package exposes and the review
 * confirmed it, else `adapt` (E40, C15), and must confirm or correct the statement. A later stage whose branch no longer holds the sealed
 * change is sent back once, then fails (E33); `adapt` that kept the seal reaches its gates and hands over to the home review. The `##
 * Handoff` holds one part per stage that built, each stage writing only its own, and a package build that refuses the change ends `refused`
 * with a `package-refused` decision that holds the ticket (E22). An adapt build that needs more of the package ends `package-return`: the
 * seal is lifted, the row goes back to the package build, the return is counted and logged (E41), and the reason waits for the package
 * builder, while the adapt branch holds no change of the package (E42); a second return opens `second-return` and keeps `adapt` (E45). A
 * home review that does not hold for a cause in the package goes back to `adapt`, whose return reaches the package build (E52).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path, { join }              from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                                 from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }                            from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionWording }                     from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { TicketStage }                         from '../../lib/tracker-model/@types/Task.ts';
import type { Board }                               from '../../lib/tracker-model/Board.ts';
import { branchNamesOf }                            from '../../shared/BranchNames.ts';
import { LIFECYCLE_LIMITS }                         from '../../shared/constants/LifecycleLimits.ts';
import { PRODUCT_NAMES }                            from '../../shared/constants/ProductNames.ts';
import { boardFixture, taskFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import {
  ENTITY_FORGE_ENTITIES,
  ENTITY_FORGE_LOCK_FILE,
  ENTITY_FORGE_MAIN_LINE,
  ENTITY_FORGE_TICKETS,
  entityForgePipelineOf,
  sourceFileOf
} from '../../testing/EntityForgeFixture.ts';
import { ENTITY_FORGE_SCENARIOS, type EntityForgeScenario } from '../../testing/EntityForgeScenarios.ts';
import { useRecordedGit }                                   from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }   from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                        from '../../testing/ToolGuard.ts';
import { sealOf }                                           from '../lifecycle/Customs.ts';
import { CrossingStages }                                   from './CrossingStages.ts';
import { JobLaunch, type JobLaunchContext }                 from './JobLaunch.ts';
import { RedHandoff }                                       from './RedHandoff.ts';
import { WatcherFleet }                                     from './WatcherFleet.ts';
import {
  CrossingStageRun,
  type CrossingStagePlace,
  type StageJob,
  type StageRun
} from './testing/CrossingStageRun.ts';

const AT = '2026-11-17T17:00:00+01:00';
const { SHOP, ADMIN, UI_KIT } = ENTITY_FORGE_ENTITIES;
const { SHOP_TICKET } = ENTITY_FORGE_TICKETS;
const CROSSING_PIPELINE = entityForgePipelineOf('shop-crosses-into-ui-kit');
const WORDING: DecisionWording = {
  questions: [{
    question: 'Example decision?', header: 'example', multiSelect: false, options: []
  }],
  context: '',
};

const PACKAGE_BUILD: TicketStage  = { name: 'package-build', entity: UI_KIT.key };
const PACKAGE_REVIEW: TicketStage = { name: 'package-review', entity: UI_KIT.key };
const ADAPT: TicketStage          = { name: 'adapt', entity: SHOP.key };
const HOME_REVIEW: TicketStage    = { name: 'review', entity: SHOP.key };

const { enterScenario } = useRecordedGit();

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

const {
  runStage, stageRunOf: runOf, builtReportOf, reviewedReportOf, commitsOf
} = CrossingStageRun;

type CrossingTicket = CrossingStagePlace;

interface CrossingRow {
  stage?:          TicketStage;
  seals?:          Record<string, string>;
  status?:         'in-progress' | 'in-review';
  pipeline?:       Pipeline;
  packageReturns?: number;
}

/** The shop's ticket in a scratch copy of the fixture's places, its row storing `stage` and `seals` when given. */
function crossingTicketOf(row: CrossingRow = {}): CrossingTicket {
  const repository = createScratchDirectory('entity-forge-crossing');
  folders.push(repository);
  const trackerDirectory = join(repository, PRODUCT_NAMES.DATA_FOLDER);
  mkdirSync(trackerDirectory, { recursive: true });
  const status = row.status ?? 'in-progress';
  const { board } = boardFixture({
    pipeline: row.pipeline ?? CROSSING_PIPELINE,
    tasks:    [taskFixture({
      id:     1,
      ticket: SHOP_TICKET.id,
      status,
      ...(row.stage === undefined ? {} : { stage: row.stage }),
      ...(row.seals === undefined ? {} : { seals: row.seals }),
      ...(row.packageReturns === undefined ? {} : { packageReturns: row.packageReturns }),
    })],
    tickets: [ticketFixture({
      id: SHOP_TICKET.id, status, task: 1, entity: SHOP.key
    })],
  });
  board.setOverseerState('running', AT);
  const context = {
    workspace:         { rootDirectory: repository, trackerDirectory, ticketsDirectory: join(trackerDirectory, 'tickets') },
    mainLine:          ENTITY_FORGE_MAIN_LINE,
    branchNames:       branchNamesOf(null),
    log:               () => undefined,
    platformPorts:     { dataFolders: { pathModule: path, foldsCase: false } },
    decisionWordingOf: () => WORDING,
  } as unknown as JobLaunchContext;
  return {
    board, context, repository, ticketId: SHOP_TICKET.id, enterScenario, at: AT, gatedTreeId: 'example-tree'
  };
}

function shopTicketOf(board: Board) {
  return board.tickets().find((ticket) => ticket.frontmatter.id === SHOP_TICKET.id);
}

function batonPassOf(ticket: CrossingTicket, job: Readonly<Job>): string {
  return readFileSync(RedHandoff.batonPassPathOf(WatcherFleet.jobFolderOf(ticket.context.workspace.trackerDirectory, job.id)), 'utf8');
}

function ticketWorktreeOf(ticket: CrossingTicket): string {
  return JobLaunch.worktreeOf(ticket.context.workspace, { ticketIds: [SHOP_TICKET.id] } as unknown as Job);
}

const SHOP_BUILD: StageJob     = { kind: 'build', entity: SHOP.key, stage: 1 };
const PACKAGE_BUILDER: StageJob  = { kind: 'build', entity: UI_KIT.key, stage: 2 };
const PACKAGE_REVIEWER: StageJob = { kind: 'review', entity: UI_KIT.key, stage: 3 };
const ADAPT_BUILD: StageJob    = { kind: 'build', entity: SHOP.key, stage: 4 };
const HOME_REVIEWER: StageJob  = { kind: 'review', entity: SHOP.key, stage: 5 };

describeWhenGitIsRecorded('stage 1 of a shop that whitelists the package', () => {
  test('crosses into the package once gated: the package build is next, the ticket stays in progress and its Handoff is written', () => {
    const ticket = crossingTicketOf();
    const { whereTheJobWent } = runStage(ticket, SHOP_BUILD, runOf('SHOP_TICKET_INTO_UI_KIT', '<start>', builtReportOf()));

    expect(whereTheJobWent).toBe('built: ');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_BUILD);
    expect(shopTicketOf(ticket.board)?.frontmatter.status).toBe('in-progress');
    expect(shopTicketOf(ticket.board)?.body).toContain(`## Handoff\n\n### Stage 1, build of ${SHOP.key}\n\nExample handoff.`);
  });

  test('that changed only the shop\'s files settles as a build always has: the ticket goes to review with no stage (E10)', () => {
    const ticket = crossingTicketOf();
    const { whereTheJobWent } = runStage(ticket, SHOP_BUILD, runOf('SHOP_TICKET_AT_HOME', '<start>', builtReportOf()));

    expect(whereTheJobWent).toBe('built: ');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toBeNull();
    expect(shopTicketOf(ticket.board)?.frontmatter.status).toBe('in-review');
  });

  test('that changed the admin app, which it does not whitelist, is sent back once (E11)', () => {
    const { whereTheJobWent } = runStage(crossingTicketOf(), SHOP_BUILD, runOf('SHOP_TICKET_INTO_ADMIN', '<start>', builtReportOf()));

    expect(whereTheJobWent).toBe('interrupted: V17');
  });

  test('that changed only the package is sent back as work of another entity, then fails (E15)', () => {
    const ticket = crossingTicketOf();
    const { job, whereTheJobWent } = runStage(ticket, SHOP_BUILD, runOf('SHOP_TICKET_ONLY_UI_KIT', '<start>', builtReportOf()));

    expect(whereTheJobWent).toBe('interrupted: V17');
    expect(batonPassOf(ticket, job)).toContain(`changed-only-outside-home-and-reach\n${sourceFileOf(UI_KIT)}`);
    expect(runStage(crossingTicketOf(), SHOP_BUILD, {
      scenario: ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ONLY_UI_KIT, startCommit: '<start>', reportOf: builtReportOf(), scopeResumed: true
    }).whereTheJobWent).toBe('failed: changed-only-outside-home-and-reach');
  });
});

describeWhenGitIsRecorded('stage 2, the package build', () => {
  test('that accepts the proposal commits nothing, and hands over to the package review with its statement (E20)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });
    const { job, whereTheJobWent } = runStage(ticket, PACKAGE_BUILDER, runOf('SHOP_TICKET_INTO_UI_KIT', '<shop ticket tip>', builtReportOf({ exposedSurfaceChanged: false })));

    expect(whereTheJobWent).toBe('built: ');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_REVIEW);
    expect(shopTicketOf(ticket.board)?.frontmatter.status).toBe('in-progress');
    expect(CrossingStages.stageStatementOf(ticket.context.workspace.trackerDirectory, job.id)).toEqual({ stage: 'package-build', exposedSurfaceChanged: false });
  });

  test('that reshapes the package answers only for its own commit, though the branch holds the shop\'s change (E21)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });
    const { whereTheJobWent } = runStage(ticket, PACKAGE_BUILDER, runOf('SHOP_TICKET_PACKAGE_RESHAPED', '<shop ticket tip>', builtReportOf({ exposedSurfaceChanged: true })));

    expect(whereTheJobWent).toBe('built: ');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_REVIEW);
  });

  test('whose own commits change the shop\'s files and the lockfile is sent back (E23)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });
    const { job, whereTheJobWent } = runStage(ticket, PACKAGE_BUILDER, runOf('SHOP_TICKET_INTO_UI_KIT', '<start>', builtReportOf({ exposedSurfaceChanged: false })));

    expect(whereTheJobWent).toBe('interrupted: V17');
    expect(batonPassOf(ticket, job)).toContain(sourceFileOf(SHOP));
    expect(batonPassOf(ticket, job)).toContain(ENTITY_FORGE_LOCK_FILE);
  });

  test('whose own commits lie only in the shop is sent back, then fails, and opens no move to another entity (E23)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });
    const run: StageRun = runOf('SHOP_TICKET_ADAPTED', '<shop ticket tip>', builtReportOf({ exposedSurfaceChanged: false }));
    const { job, whereTheJobWent } = runStage(ticket, PACKAGE_BUILDER, run);

    expect(whereTheJobWent).toBe('interrupted: V17');
    expect(batonPassOf(ticket, job)).toContain(`changed-outside-home-and-reach\n${sourceFileOf(SHOP)}`);
    const sentBack = crossingTicketOf({ stage: PACKAGE_BUILD });
    expect(runStage(sentBack, PACKAGE_BUILDER, { ...run, scopeResumed: true }).whereTheJobWent).toBe('failed: changed-outside-home-and-reach');
    expect(sentBack.board.decisions()).toEqual([]);
  });

  test('retried after it failed on a change outside the package still answers for that change (E23)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });
    const failed = runOf('SHOP_TICKET_ADAPTED', '<shop ticket tip>', builtReportOf({ exposedSurfaceChanged: false }));
    expect(runStage(ticket, PACKAGE_BUILDER, { ...failed, scopeResumed: true }).whereTheJobWent).toBe('failed: changed-outside-home-and-reach');

    const { job, whereTheJobWent } = runStage(ticket, PACKAGE_BUILDER, runOf('SHOP_TICKET_ADAPTED', '<stage tip>', builtReportOf({ exposedSurfaceChanged: false })));

    expect(whereTheJobWent).toBe('interrupted: V17');
    expect(batonPassOf(ticket, job)).toContain(sourceFileOf(SHOP));
  });

  test('runs the package\'s gates, then those of its dependents but the home, each from its own home (E25, E26)', () => {
    const job = { entity: UI_KIT.key, stage: 2 } as unknown as Job;
    const manifest = JobLaunch.manifestOf(CROSSING_PIPELINE, job, 'build', SHOP.key);

    expect(manifest?.gates.map((gate) => gate.name)).toEqual(['verify', `${ADMIN.key}: verify`]);
    expect(Object.keys(manifest?.entityPhaseHashes ?? {}).sort()).toEqual([ADMIN.key, UI_KIT.key].sort());
    expect(JobLaunch.manifestOf(CROSSING_PIPELINE, { entity: UI_KIT.key, stage: 3 } as unknown as Job, 'build', SHOP.key)?.gates.map((gate) => gate.name))
      .toEqual(['verify']);
  });

  test('whose dependent\'s gate is red is sent back to the package builder (E26)', () => {
    const run: StageRun = { ...runOf('SHOP_TICKET_INTO_UI_KIT', '<shop ticket tip>', builtReportOf({ exposedSurfaceChanged: false })), redGate: `${ADMIN.key}: verify` };
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });

    expect(runStage(ticket, PACKAGE_BUILDER, run).whereTheJobWent).toBe(`interrupted: ${ADMIN.key}: verify`);
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_BUILD);
  });

  test('whose dependent\'s gate is still red once the resumes are spent ends and opens dependent-broken naming the gate (E26)', () => {
    const run: StageRun = {
      ...runOf('SHOP_TICKET_INTO_UI_KIT', '<shop ticket tip>', builtReportOf({ exposedSurfaceChanged: false })),
      redGate:           `${ADMIN.key}: verify`,
      redHandoffsBefore: LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    };
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });

    expect(runStage(ticket, PACKAGE_BUILDER, run).whereTheJobWent).toBe('failed: gate-failed');
    expect(ticket.board.decisions()).toMatchObject([{ kind: 'dependent-broken', ticketIds: [SHOP_TICKET.id], context: `${ADMIN.key}: verify` }]);
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_BUILD);
  });

  test('whose own gate is still red once the resumes are spent goes the red handoff\'s way and opens no dependent-broken (E26)', () => {
    const run: StageRun = {
      ...runOf('SHOP_TICKET_INTO_UI_KIT', '<shop ticket tip>', builtReportOf({ exposedSurfaceChanged: false })),
      redGate:           'verify',
      redHandoffsBefore: LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    };
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });

    expect(runStage(ticket, PACKAGE_BUILDER, run).whereTheJobWent).toBe('interrupted: verify');
    expect(ticket.board.decisions()).toEqual([]);
  });

  test('writes its own part of the Handoff after stage 1\'s, which it keeps', () => {
    const ticket = crossingTicketOf();
    runStage(ticket, SHOP_BUILD, runOf('SHOP_TICKET_INTO_UI_KIT', '<start>', builtReportOf()));
    runStage(ticket, PACKAGE_BUILDER, runOf('SHOP_TICKET_INTO_UI_KIT', '<shop ticket tip>', builtReportOf({ exposedSurfaceChanged: false, handoff: 'Example package handoff.' })));

    expect(shopTicketOf(ticket.board)?.body).toContain(
      `## Handoff\n\n### Stage 1, build of ${SHOP.key}\n\nExample handoff.\n\n### Stage 2, package build of ${UI_KIT.key}\n\nExample package handoff.\n`
    );
  });

  test('that refuses the change ends refused and opens package-refused with its reason, which holds the ticket (E22)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });
    const refused = builtReportOf({ outcome: 'refused', exposedSurfaceChanged: false, refusedReason: 'The constitution forbids a second export.' });
    const { whereTheJobWent } = runStage(ticket, PACKAGE_BUILDER, runOf('SHOP_TICKET_INTO_UI_KIT', '<shop ticket tip>', refused));

    expect(whereTheJobWent).toBe('refused: ');
    expect(ticket.board.decisions()).toMatchObject([{ kind: 'package-refused', ticketIds: [SHOP_TICKET.id], context: 'The constitution forbids a second export.' }]);
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_BUILD);
  });

  test('whose report does not state what the package exposes fails as a report without one (E40)', () => {
    const { whereTheJobWent } = runStage(crossingTicketOf({ stage: PACKAGE_BUILD }), PACKAGE_BUILDER, runOf('SHOP_TICKET_INTO_UI_KIT', '<shop ticket tip>', builtReportOf()));

    expect(whereTheJobWent).toBe('failed: no-report');
  });
});

/**
 * The package build of `ticket` accepted the proposal and ended `built` with its statement, then the package review fixed the package and
 * ran with its report.
 */
function reviewedPackageOf(ticket: CrossingTicket, exposedSurfaceChanged: boolean, reviewFields: Record<string, unknown>): string {
  runStage(ticket, PACKAGE_BUILDER, runOf('SHOP_TICKET_INTO_UI_KIT', '<shop ticket tip>', builtReportOf({ exposedSurfaceChanged })));
  return runStage(ticket, PACKAGE_REVIEWER, runOf('SHOP_TICKET_PACKAGE_RESHAPED', '<shop ticket tip>', reviewedReportOf(reviewFields))).whereTheJobWent;
}

/** The fixture's pipeline with the package's own review and `reach` changed. */
function pipelineWithPackage(packageFields: Record<string, unknown>): Pipeline {
  const entities = CROSSING_PIPELINE.entities ?? {};
  const uiKit = entities[UI_KIT.key];
  if (uiKit === undefined) throw new Error('The fixture names ui-kit.');
  return { ...CROSSING_PIPELINE, entities: { ...entities, [UI_KIT.key]: { ...uiKit, ...packageFields } } };
}

function reviewsRecordedOf(board: Board): number[] {
  return board.logRecordsSoFar().flatMap((record) => (record.kind === 'review-recorded' && record.ticketId === SHOP_TICKET.id ? [record.fields.round] : []));
}

describeWhenGitIsRecorded('stage 3, the package review', () => {
  test('that fixes in the package and holds seals the ticket\'s own change, records its round and closes its bar (E30)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });

    expect(reviewedPackageOf(ticket, false, { exposedSurfaceConfirmed: true })).toBe('reviewed: ');
    const seal = sealOf(ticketWorktreeOf(ticket), ENTITY_FORGE_MAIN_LINE, CrossingStages.sealPathspecsOf(CROSSING_PIPELINE, UI_KIT.key));
    expect(seal).not.toBeNull();
    expect(ticket.board.ticketSealsOf(SHOP_TICKET.id)).toEqual({ [UI_KIT.key]: seal ?? '' });
    expect(reviewsRecordedOf(ticket.board)).toEqual([1]);
    expect(shopTicketOf(ticket.board)?.body).not.toContain('## Review');
    expect(ticket.board.tasks().filter((task) => task.reviewOf === SHOP_TICKET.id && task.status === 'in-progress')).toEqual([]);
  });

  test('whose fixes pass the package\'s re-review threshold is granted a round and seals nothing yet (E31)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD, pipeline: pipelineWithPackage({ review: { name: 'review', reReview: { thresholdLines: 0 } } }) });

    expect(reviewedPackageOf(ticket, false, { exposedSurfaceConfirmed: true })).toBe('round-granted: ');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_REVIEW);
    expect(ticket.board.ticketSealsOf(SHOP_TICKET.id)).toEqual({});
  });

  test('seals a lockfile change of the package stages with the package, so a later job that changes it is sent back (E3, E33)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD, pipeline: pipelineWithPackage({ reach: [`/${ENTITY_FORGE_LOCK_FILE}`] }) });
    runStage(ticket, PACKAGE_BUILDER, runOf('SHOP_TICKET_LOCKFILE_SEALED', '<shop ticket tip>', builtReportOf({ exposedSurfaceChanged: false })));
    const { job } = runStage(ticket, PACKAGE_REVIEWER, runOf('SHOP_TICKET_LOCKFILE_SEALED', '<shop ticket tip>', reviewedReportOf({ exposedSurfaceConfirmed: true })));

    const pathspecs = CrossingStages.sealPathspecsOf(ticket.board.pipeline(), UI_KIT.key, [ENTITY_FORGE_LOCK_FILE]);
    expect(pathspecs).toEqual([UI_KIT.homeFolder, ENTITY_FORGE_LOCK_FILE]);
    expect(ticket.board.ticketSealsOf(SHOP_TICKET.id)).toEqual({ [UI_KIT.key]: sealOf(ticketWorktreeOf(ticket), ENTITY_FORGE_MAIN_LINE, pathspecs) ?? '' });
    expect(CrossingStages.stageStatementOf(ticket.context.workspace.trackerDirectory, job.id)).toMatchObject({ sealedReachPaths: [ENTITY_FORGE_LOCK_FILE] });

    const homeReview = runStage(ticket, HOME_REVIEWER, runOf('SHOP_TICKET_PACKAGE_RESHAPED', '<stage tip>', reviewedReportOf()));
    expect(homeReview.whereTheJobWent).toBe('interrupted: V17');
    expect(batonPassOf(ticket, homeReview.job)).toContain(`sealed-change-altered\n${UI_KIT.key}`);
  });

  test('skips adapt when the package build stated no change of what the package exposes and the review confirmed it (E40, C15)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });
    reviewedPackageOf(ticket, false, { exposedSurfaceConfirmed: true });

    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(HOME_REVIEW);
    expect(shopTicketOf(ticket.board)?.frontmatter.status).toBe('in-review');
  });

  test.each([
    ['the package build stated a change', true, true],
    ['the review corrected the statement', false, false],
  ])('runs adapt when %s (E40, C15)', (_name, exposedSurfaceChanged, exposedSurfaceConfirmed) => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });
    reviewedPackageOf(ticket, exposedSurfaceChanged, { exposedSurfaceConfirmed });

    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(ADAPT);
    expect(shopTicketOf(ticket.board)?.frontmatter.status).toBe('in-progress');
  });

  test('that does not hold sends the package build back and seals nothing (E34)', () => {
    const ticket = crossingTicketOf({ stage: PACKAGE_BUILD });
    const claims = [{
      item: 'A1', result: 'does-not-hold', handoffContradicted: false, note: 'The example part breaks.'
    }];

    expect(reviewedPackageOf(ticket, false, { exposedSurfaceConfirmed: true, claims })).toBe('does-not-hold: ');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_BUILD);
    expect(ticket.board.ticketSealsOf(SHOP_TICKET.id)).toEqual({});
  });

  test('whose report neither confirms nor corrects the statement fails as a report without one (E40)', () => {
    expect(reviewedPackageOf(crossingTicketOf({ stage: PACKAGE_BUILD }), false, {})).toBe('failed: no-report');
  });
});

/** The seal the package review stores on the scenario's branch, read through the recorded git. */
function sealIn(scenario: EntityForgeScenario): string {
  const ticket = crossingTicketOf();
  enterScenario(scenario, { repositoryDirectory: ticket.repository, commits: commitsOf(scenario) });
  const worktree = ticketWorktreeOf(ticket);
  mkdirSync(worktree, { recursive: true });
  return sealOf(worktree, ENTITY_FORGE_MAIN_LINE, CrossingStages.sealPathspecsOf(CROSSING_PIPELINE, UI_KIT.key)) ?? '';
}

describeWhenGitIsRecorded('a stage after the seal', () => {
  test('adapt whose branch still holds the sealed change reaches its gates and hands over to the home review', () => {
    const seal = sealIn(ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ADAPTED);
    const ticket = crossingTicketOf({ stage: ADAPT, seals: { [UI_KIT.key]: seal } });
    const { whereTheJobWent } = runStage(ticket, ADAPT_BUILD, runOf('SHOP_TICKET_ADAPTED', '<shop ticket tip>', builtReportOf()));

    expect(whereTheJobWent).toBe('built: ');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(HOME_REVIEW);
    expect(shopTicketOf(ticket.board)?.frontmatter.status).toBe('in-review');
    expect(shopTicketOf(ticket.board)?.body).toContain(`## Handoff\n\n### Stage 4, adapt of ${SHOP.key}\n\nExample handoff.\n`);
  });

  test('the home review of a branch that no longer holds the sealed change is sent back once, then fails (E33)', () => {
    const ticket = crossingTicketOf({ stage: HOME_REVIEW, seals: { [UI_KIT.key]: 'an-example-seal-of-another-change' }, status: 'in-review' });
    const run: StageRun = runOf('SHOP_TICKET_INTO_UI_KIT', '<shop ticket tip>', reviewedReportOf());
    const { job, whereTheJobWent } = runStage(ticket, HOME_REVIEWER, run);

    expect(whereTheJobWent).toBe('interrupted: V17');
    expect(batonPassOf(ticket, job)).toContain(`sealed-change-altered\n${UI_KIT.key}`);
    const sentBack = crossingTicketOf({ stage: HOME_REVIEW, seals: { [UI_KIT.key]: 'an-example-seal-of-another-change' }, status: 'in-review' });
    expect(runStage(sentBack, HOME_REVIEWER, { ...run, scopeResumed: true }).whereTheJobWent).toBe('failed: sealed-change-altered');
  });
});

const PACKAGE_RETURN_REASON = 'The package must export the basket total in cents.';

/** An adapt build's report that sends the ticket back to the package with `PACKAGE_RETURN_REASON`. */
function packageReturnReportOf(extraFields: Record<string, unknown> = {}): StageRun['reportOf'] {
  return builtReportOf({ outcome: 'package-return', packageReturnReason: PACKAGE_RETURN_REASON, ...extraFields });
}

function loggedPackageReturnsOf(board: Board) {
  return board.logRecordsSoFar().flatMap((record) => (record.kind === 'package-return' && record.ticketId === SHOP_TICKET.id ? [record.fields] : []));
}

/** The package build the Playbook would launch next for the returned ticket, launched straight on the board. */
function returnedPackageBuildOf(ticket: CrossingTicket): Readonly<Job> {
  return ticket.board.launchJob({
    kind: 'build', role: 'builder', ticketIds: [SHOP_TICKET.id], parentJobId: null, attempt: 2, target: ENTITY_FORGE_MAIN_LINE, entity: UI_KIT.key, stage: 2
  }, AT).job;
}

describeWhenGitIsRecorded('stage 4, adapt, that sends the ticket back to the package', () => {
  test('lifts the seal, moves the row to the package build, counts one return and logs package-return (E41)', () => {
    const ticket = crossingTicketOf({ stage: ADAPT, seals: { [UI_KIT.key]: sealIn(ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ADAPTED) } });
    const { whereTheJobWent } = runStage(ticket, ADAPT_BUILD, runOf('SHOP_TICKET_ADAPTED', '<shop ticket tip>', packageReturnReportOf()));

    expect(whereTheJobWent).toBe('package-return: ');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_BUILD);
    expect(ticket.board.ticketSealsOf(SHOP_TICKET.id)).toEqual({});
    expect(ticket.board.tasks()[0]?.packageReturns).toBe(1);
    expect(loggedPackageReturnsOf(ticket.board)).toEqual([{ entity: UI_KIT.key, fromStage: 'adapt', returns: 1 }]);
    expect(shopTicketOf(ticket.board)?.frontmatter.status).toBe('in-progress');
  });

  test('for one more change in the package gives the package build its reason, its own commits holding no change of the package (E42)', () => {
    const ticket = crossingTicketOf({ stage: ADAPT, seals: { [UI_KIT.key]: sealIn(ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ADAPTED) } });
    const { job } = runStage(ticket, ADAPT_BUILD, runOf('SHOP_TICKET_ADAPTED', '<shop ticket tip>', packageReturnReportOf({ packageReturnEntity: UI_KIT.key })));

    expect(CrossingStages.stageStatementOf(ticket.context.workspace.trackerDirectory, job.id))
      .toEqual({ stage: 'adapt', returnedPackage: UI_KIT.key, packageReturnReason: PACKAGE_RETURN_REASON });
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_BUILD);
    expect(CrossingStages.crossingStageFactsOf(ticket.board, ticket.context.workspace.trackerDirectory, returnedPackageBuildOf(ticket), false))
      .toEqual({ stage: 'package-build', homeEntity: SHOP.key, packageReturnReason: PACKAGE_RETURN_REASON });
  });

  test('whose own commit changed the package is sent back, and the ticket stays in adapt (E42)', () => {
    const ticket = crossingTicketOf({ stage: ADAPT, seals: { [UI_KIT.key]: sealIn(ENTITY_FORGE_SCENARIOS.SHOP_TICKET_PACKAGE_RESHAPED) } });
    const { job, whereTheJobWent } = runStage(ticket, ADAPT_BUILD, runOf('SHOP_TICKET_PACKAGE_RESHAPED', '<shop ticket tip>', packageReturnReportOf()));

    expect(whereTheJobWent).toBe('interrupted: V17');
    expect(batonPassOf(ticket, job)).toContain(`changed-outside-home-and-reach\n${sourceFileOf(UI_KIT)}`);
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(ADAPT);
    expect(loggedPackageReturnsOf(ticket.board)).toEqual([]);
  });

  test('naming a package that is not sealed fails as a report without one, and the row keeps adapt (E41)', () => {
    const ticket = crossingTicketOf({ stage: ADAPT, seals: { [UI_KIT.key]: sealIn(ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ADAPTED) } });
    const { whereTheJobWent } = runStage(ticket, ADAPT_BUILD, runOf('SHOP_TICKET_ADAPTED', '<shop ticket tip>', packageReturnReportOf({ packageReturnEntity: ADMIN.key })));

    expect(whereTheJobWent).toBe('failed: no-report');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(ADAPT);
  });

  test('after one earlier return opens second-return, keeps the seal and the count, and the row keeps adapt (E45)', () => {
    const seal = sealIn(ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ADAPTED);
    const ticket = crossingTicketOf({ stage: ADAPT, seals: { [UI_KIT.key]: seal }, packageReturns: 1 });
    const { whereTheJobWent } = runStage(ticket, ADAPT_BUILD, runOf('SHOP_TICKET_ADAPTED', '<shop ticket tip>', packageReturnReportOf()));

    expect(whereTheJobWent).toBe('package-return: ');
    expect(ticket.board.decisions()).toMatchObject([{ kind: 'second-return', ticketIds: [SHOP_TICKET.id], context: UI_KIT.key }]);
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(ADAPT);
    expect(ticket.board.ticketSealsOf(SHOP_TICKET.id)).toEqual({ [UI_KIT.key]: seal });
    expect(ticket.board.tasks()[0]?.packageReturns).toBe(1);
    expect(loggedPackageReturnsOf(ticket.board)).toEqual([]);
  });

  test('after a home review that does not hold for a cause in the package reaches the package build (E52)', () => {
    const seals = { [UI_KIT.key]: sealIn(ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ADAPTED_REVIEWED) };
    const ticket = crossingTicketOf({ stage: HOME_REVIEW, seals, status: 'in-review' });
    const claims = [{
      item: 'A1', result: 'does-not-hold', handoffContradicted: false, note: 'The package exports the total in euros.'
    }];
    const homeReview = runStage(ticket, HOME_REVIEWER, runOf('SHOP_TICKET_ADAPTED_REVIEWED', '<adapt tip>', reviewedReportOf({ claims, reviewText: 'The cause is in ui-kit.' })));
    expect(homeReview.whereTheJobWent).toBe('does-not-hold: ');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(ADAPT);

    const { whereTheJobWent } = runStage(ticket, ADAPT_BUILD, runOf('SHOP_TICKET_ADAPTED_REVIEWED', '<adapt tip>', packageReturnReportOf()));

    expect(whereTheJobWent).toBe('package-return: ');
    expect(ticket.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_BUILD);
    expect(ticket.board.ticketSealsOf(SHOP_TICKET.id)).toEqual({});
    expect(ticket.board.tasks()[0]?.packageReturns).toBe(1);
  });
});

describe('a stage scope of a forge without a crossing', () => {
  test('a job of an entity whose ticket\'s row stores no stage gets no crossing scope from Customs', () => {
    const { board } = boardFixture({ pipeline: CROSSING_PIPELINE, tickets: [ticketFixture({ id: SHOP_TICKET.id, status: 'in-progress', entity: SHOP.key })] });
    const { job } = board.launchJob({
      kind: 'build', role: 'builder', ticketIds: [SHOP_TICKET.id], parentJobId: null, attempt: 1, target: ENTITY_FORGE_MAIN_LINE, entity: SHOP.key, stage: 1
    }, AT);

    expect(CrossingStages.crossingStageScopeOf(board, '', job)).toBeNull();
  });
});
