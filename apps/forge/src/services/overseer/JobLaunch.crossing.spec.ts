/**
 * A ticket of the shop that crosses into the package `ui-kit`, stage by stage, on the entity-forge fixture with the shop whitelisting the
 * package: each stage job verified by Customs against the fixture's recorded git, gated green and settled. What matters, by strategy 5.2
 * to 5.6: stage 1 may write a proposal in the whitelisted package, and once gated, the paths its branch changed are sorted by owner, so the
 * package's build is the next stage and the ticket stays in progress; a branch that stayed in the shop settles as it always has (E10); a
 * change to an entity that is neither home nor whitelisted is still sent back (E11); a stage 1 that changed only the package is sent back
 * as work of another entity (E15). The package build answers only for its own commits, may commit nothing (E20) or reshape the package
 * (E21), is sent back for a change outside the package, then fails, also when all its commits lie outside the package, which is no work of
 * another entity (E23), and a retry still answers for the failed job's commits; it must state what the package exposes (E40). Its gate run
 * checks the package, then the package's dependents but the home, and a red one is its red handoff (E25, E26). The package review settles
 * its rounds and record as any review: it may fix in the package (E30), is granted a round by the package's re-review (E31), and one that
 * does not hold sends the package build back (E34); one that holds seals the ticket's own change to the package, a lockfile change of its
 * stages among it (E3), and runs the home review when the build stated no change of what the package exposes and the review confirmed it,
 * else `adapt` (E40, C15), and must confirm or correct the statement. A later stage whose branch no longer holds the sealed change is sent
 * back once, then fails (E33); `adapt` that kept the seal reaches its gates and hands over to the home review.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path, { join }                             from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { GitProcess }                               from '../../lib/git/GitProcess.ts';
import type { Job }                                 from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }                            from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionWording }                     from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { TicketStage }                         from '../../lib/tracker-model/@types/Task.ts';
import type { Board }                               from '../../lib/tracker-model/Board.ts';
import { PipelineUtil }                             from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { TicketBodyHashUtil }                       from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { TicketStageUtil }                          from '../../lib/tracker-model/utils/TicketStageUtil.ts';
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
import { ENTITY_FORGE_SCENARIO_COMMITS, ENTITY_FORGE_SCENARIOS, type EntityForgeScenario } from '../../testing/EntityForgeScenarios.ts';
import { useRecordedGit }                                                                  from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }                                  from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                                       from '../../testing/ToolGuard.ts';
import { launchSnapshotOf, sealOf }                                                        from '../lifecycle/Customs.ts';
import type { TrackerChange }                                                              from '../tracker/TrackerPipeline.ts';
import { CrossingStages }                                                                  from './CrossingStages.ts';
import { JobLaunch, type JobLaunchContext }                                                from './JobLaunch.ts';
import { RedHandoff }                                                                      from './RedHandoff.ts';
import { WatcherFleet }                                                                    from './WatcherFleet.ts';

const AT = '2026-11-17T17:00:00+01:00';
const OBJECT_ID_LENGTH = 40;
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

function commitsOf(scenario: EntityForgeScenario): Record<string, string> {
  return Object.fromEntries(ENTITY_FORGE_SCENARIO_COMMITS[scenario].map((placeholder, i) => [placeholder, `${i + 1}`.repeat(OBJECT_ID_LENGTH)]));
}

/** The shop's ticket in a scratch copy of the fixture's places, its row storing `stage` and `seals` when given. */
interface CrossingTicket {
  readonly board:      Board;
  readonly context:    JobLaunchContext;
  readonly repository: string;
}

interface CrossingRow {
  stage?:    TicketStage;
  seals?:    Record<string, string>;
  status?:   'in-progress' | 'in-review';
  pipeline?: Pipeline;
}

function crossingTicketOf(row: CrossingRow = {}): CrossingTicket {
  const repository = createScratchDirectory('entity-forge-crossing');
  folders.push(repository);
  const trackerDirectory = join(repository, PRODUCT_NAMES.DATA_FOLDER);
  mkdirSync(trackerDirectory, { recursive: true });
  const status = row.status ?? 'in-progress';
  const { board } = boardFixture({
    pipeline: row.pipeline ?? CROSSING_PIPELINE,
    tasks:    [taskFixture({
      id: 1, ticket: SHOP_TICKET.id, status, ...(row.stage === undefined ? {} : { stage: row.stage }), ...(row.seals === undefined ? {} : { seals: row.seals })
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
  return { board, context, repository };
}

/** A stage job of the ticket: its kind, the entity it runs under and the stage's number. */
interface StageJob {
  readonly kind:   'build' | 'review';
  readonly entity: string;
  readonly stage:  number;
}

/** Where a stage job's session started, as the scenario names its commits, and its report beside the head it ran on. */
interface StageRun {
  readonly scenario:      EntityForgeScenario;
  readonly startCommit:   string;
  readonly reportOf:      (headCommit: string) => Record<string, unknown>;
  /** A scope resume this job already spent on an earlier V17 refusal. */
  readonly scopeResumed?: boolean;
  /** The gate of the job's run that is red, by its name in the run; every gate passes when absent. */
  readonly redGate?:      string;
}

function runOf(scenarioName: keyof typeof ENTITY_FORGE_SCENARIOS, startCommit: string, reportOf: StageRun['reportOf']): StageRun {
  return { scenario: ENTITY_FORGE_SCENARIOS[scenarioName], startCommit, reportOf };
}

function builtReportOf(extraFields: Record<string, unknown> = {}): (headCommit: string) => Record<string, unknown> {
  return (headCommit) => ({
    role:              'builder',
    outcome:           'built',
    headCommit,
    acceptance:        [],
    alsoFixed:         [],
    gates:             [{ name: 'verify', commit: headCommit }],
    handoff:           'Example handoff.',
    blockedReason:     null,
    cannotBuildReason: null,
    ...extraFields,
  });
}

function reviewedReportOf(extraFields: Record<string, unknown> = {}): (headCommit: string) => Record<string, unknown> {
  return (headCommit) => ({
    role: 'reviewer', headCommit, claims: [], findings: [], reviewText: 'Example package review.', ...extraFields
  });
}

function observationOf(job: Readonly<Job>, report: unknown, gate: Parameters<typeof JobLaunch.applyBuildJobObservations>[2][number]['gate']) {
  return {
    jobId:            job.id,
    setup:            'installed' as const,
    calls:            1,
    report,
    agentEnd:         null,
    gate,
    sandboxRefusal:   null,
    targetCatchUp:    { verdict: 'not-checked' as const },
    mainMerge:        null,
    conflictReReview: null,
  };
}

/** The job's state after Customs, and once Customs passed, after its gate judged its tree green: its outcome and cause once it ended. */
function runStage(ticket: CrossingTicket, stageJob: StageJob, run: StageRun): { job: Readonly<Job>; whereTheJobWent: string } {
  const { board, context, repository } = ticket;
  const { job } = board.launchJob({
    kind:        stageJob.kind,
    role:        stageJob.kind === 'build' ? 'builder' : 'reviewer',
    ticketIds:   [SHOP_TICKET.id],
    parentJobId: null,
    attempt:     1,
    target:      ENTITY_FORGE_MAIN_LINE,
    entity:      stageJob.entity,
    stage:       stageJob.stage,
  }, AT);
  const commits = commitsOf(run.scenario);
  enterScenario(run.scenario, { repositoryDirectory: repository, commits });
  const worktree = JobLaunch.worktreeOf(context.workspace, job);
  mkdirSync(worktree, { recursive: true });
  const jobFolder = WatcherFleet.jobFolderOf(context.workspace.trackerDirectory, job.id);
  mkdirSync(jobFolder, { recursive: true });
  if (run.scopeResumed === true) {
    RedHandoff.writeRedHandoff(jobFolder, {
      kind:                'customs',
      name:                'V17',
      command:             null,
      fixCommand:          null,
      commit:              '',
      exitCode:            null,
      batonPassPath:       RedHandoff.batonPassPathOf(jobFolder),
      fullLogPath:         null,
      resume:              1,
      resumesAllowed:      LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
      interruptedInstance: 1,
      callBudget:          50,
      scopeResumed:        true,
    }, 'V17 refused');
  }
  const ticketBody = board.tickets().find((candidate) => candidate.frontmatter.id === SHOP_TICKET.id)?.body ?? '';
  const startCommit = commits[run.startCommit] ?? '';
  const jobStart = { startCommit, bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(ticketBody), launchSnapshot: launchSnapshotOf(worktree) };
  writeFileSync(join(jobFolder, 'start.json'), JSON.stringify(jobStart));
  const reviewStage = TicketStageUtil.stageOfJob(job);
  if (stageJob.kind === 'review' && reviewStage !== null) board.startReviewBar(SHOP_TICKET.id, { round: 1, owner: job.id, stage: reviewStage }, AT);
  for (const state of ['preparing', 'running', 'in-customs'] as const) board.moveJob(job.id, state, AT);
  const headCommit = GitProcess.resolvedCommitOf(worktree, 'HEAD') ?? '';
  const report = run.reportOf(headCommit);
  const change = { board, at: AT, workspace: context.workspace } as unknown as TrackerChange;
  JobLaunch.applyBuildJobObservations(change, context, [observationOf(job, report, { verdict: 'pending' })]);
  if (board.jobById(job.id)?.state === 'gating') {
    const manifest = { ...PipelineUtil.entitiesGateRunStampOf(board.pipeline() ?? CROSSING_PIPELINE, stageJob.kind, [stageJob.entity]), prepare: [], gates: [] };
    const verdict = run.redGate === undefined
      ? { outcome: 'passed' as const, step: null, output: '' }
      : {
        outcome: 'failed' as const, step: run.redGate, output: 'Example red gate.', exitCode: 1
      };
    JobLaunch.applyBuildJobObservations(change, context, [observationOf(job, report, {
      verdict: 'judged', treeId: 'example-tree', ...verdict, ran: true, manifest, cacheReports: []
    })]);
  }
  const ended = board.logRecordsSoFar().find((record) => record.kind === 'job-ended' && record.jobId === job.id);
  if (ended?.kind === 'job-ended') return { job, whereTheJobWent: `${ended.fields.outcome}: ${ended.fields.cause ?? ''}` };
  const state = board.jobById(job.id)?.state ?? 'gone';
  return { job, whereTheJobWent: state === 'interrupted' ? `${state}: ${RedHandoff.redHandoffFactsOf(jobFolder)?.name ?? ''}` : state };
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
    expect(shopTicketOf(ticket.board)?.body).toContain('## Handoff\n\nExample handoff.');
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

describe('a stage scope of a forge without a crossing', () => {
  test('a job of an entity whose ticket\'s row stores no stage gets no crossing scope from Customs', () => {
    const { board } = boardFixture({ pipeline: CROSSING_PIPELINE, tickets: [ticketFixture({ id: SHOP_TICKET.id, status: 'in-progress', entity: SHOP.key })] });
    const { job } = board.launchJob({
      kind: 'build', role: 'builder', ticketIds: [SHOP_TICKET.id], parentJobId: null, attempt: 1, target: ENTITY_FORGE_MAIN_LINE, entity: SHOP.key, stage: 1
    }, AT);

    expect(CrossingStages.crossingStageScopeOf(board, '', job)).toBeNull();
  });
});
