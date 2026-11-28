/**
 * A top-level forge with entities, end to end on the entity-forge fixture: a build of the shop verified by Customs against recorded git, sent
 * back or failed when it changes another entity's files, and the needs it declares filed and followed by the Playbook, each refused need
 * opening its decision and holding its ticket.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path, { join }                             from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { JOB_START_FORMAT_VERSION }                          from '../../adapters/job-start/JobStartIngestion.ts';
import { PipelineFile }                                      from '../../adapters/pipeline/PipelineFile.ts';
import type { RedHandoffFacts }                              from '../../adapters/red-handoff/RedHandoffIngestion.ts';
import type { Job }                                          from '../../domain/tracker-model/@types/Job.ts';
import type { Pipeline }                                     from '../../domain/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording, PlaybookStep } from '../../domain/tracker-model/@types/PlaybookStep.ts';
import type { Board }                                        from '../../domain/tracker-model/Board.ts';
import { EntityOwnershipUtil }                               from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import { GitProcess }                                        from '../../lib/git/GitProcess.ts';
import { branchNamesOf }                                     from '../../shared/BranchNames.ts';
import { LIFECYCLE_LIMITS }                                  from '../../shared/constants/LifecycleLimits.ts';
import { PRODUCT_NAMES }                                     from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture }                       from '../../testing/BoardFixtures.ts';
import {
  ENTITY_FORGE_ENTITIES,
  ENTITY_FORGE_MAIN_LINE,
  ENTITY_FORGE_TICKETS,
  constitutionFileOf,
  type EntityForgeEntity,
  entityForgePipelineOf,
  entityForgePipelineTextOf,
  sourceFileOf
} from '../../testing/EntityForgeFixture.ts';
import { ENTITY_FORGE_SCENARIO_COMMITS, ENTITY_FORGE_SCENARIOS, type EntityForgeScenario } from '../../testing/EntityForgeScenarios.ts';
import { fakeAgentAdapter }                                                                from '../../testing/FakeAgentAdapter.ts';
import { NO_LISTED_TICKET_LOCATIONS, NO_UNREADABLE_RECORDS }                               from '../../testing/FixtureRecordAllocation.ts';
import { useRecordedGit }                                                                  from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }                                  from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                                       from '../../testing/ToolGuard.ts';
import { launchSnapshotOf }                                                                from '../lifecycle/CustomsLaunchSnapshot.ts';
import type { BoardTransaction }                                                           from '../tracker/BoardTransaction.ts';
import { createLocalRecordAllocation }                                                     from '../tracker/LocalRecordAllocation.ts';
import type { JobLaunchContext }                                                           from './@types/JobLaunchContext.ts';
import { BuildJobPass }                                                                    from './BuildJobPass.ts';
import { jobFolderIn }                                                                     from './HephaestusFiles.ts';
import { RedHandoff }                                                                      from './RedHandoff.ts';
import { WorktreeJobs }                                                                    from './WorktreeJobs.ts';
import { keptRedHandoffOf }                                                                from './testing/KeptRedHandoff.ts';

const AT = '2026-11-17T15:00:00+01:00';
const OBJECT_ID_LENGTH = 40;
const {
  SHOP, ADMIN, UI_KIT, ROOT
} = ENTITY_FORGE_ENTITIES;
const { SHOP_TICKET, NEED_TICKET } = ENTITY_FORGE_TICKETS;
const NEED_BODY = '## Acceptance\n\nA1. The shop reads the basket total from the back office.\n\n## Brief\n\nAlex Example needs the total.\n';
const WORDING: DecisionWording = {
  questions: [{
    question: 'Example decision?', header: 'example', multiSelect: false, options: []
  }],
  context: '',
};

const { enterScenario } = useRecordedGit();

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

function commitsOf(scenario: EntityForgeScenario): Record<string, string> {
  return Object.fromEntries(ENTITY_FORGE_SCENARIO_COMMITS[scenario].map((placeholder, i) => [placeholder, `${i + 1}`.repeat(OBJECT_ID_LENGTH)]));
}

interface ForgeBuild {
  readonly board:      Board;
  readonly job:        Readonly<Job>;
  readonly context:    JobLaunchContext;
  readonly jobFolder:  string;
  readonly repository: string;
}

/** The fixture's pipeline as a top-level forge stores it, read back the way the board reads it. */
function storedPipelineIn(trackerDirectory: string): Pipeline {
  const pipelineFilePath = join(trackerDirectory, 'pipeline.json');
  writeFileSync(pipelineFilePath, entityForgePipelineTextOf('strict-isolation'));
  const reading = PipelineFile.read(pipelineFilePath);
  if (reading.verdict !== 'readable') throw new Error(`The fixture's pipeline is not read: ${reading.verdict}.`);
  return reading.pipeline;
}

/** Ticket review on, as the fixture stores it, or switched off on the pipeline read back. */
type TicketReview = 'on' | 'off';

/** The admin app's folder as a new root folder that no entity names yet: the pipeline without the admin app. */
function withoutTheAdminApp(pipeline: Pipeline): Pipeline {
  const entities = { ...pipeline.entities };
  delete entities[ADMIN.key];
  return { ...pipeline, entities };
}

/** A ticket body edit whose Brief names the package's constitution as its work. */
const NAMING_THE_UI_KIT_CONSTITUTION = { body: { text: `## Brief\nWork belongs in: \`/${constitutionFileOf(UI_KIT)}\`.\n`, appends: false }, writtenBy: 'board' as const };

/** The shop crossing into the package, as step 4's pipeline whitelists it. */
function withTheShopCrossingIntoTheUiKit(pipeline: Pipeline): Pipeline {
  const entities = { ...pipeline.entities };
  const shop = entities[SHOP.key];
  if (shop !== undefined) entities[SHOP.key] = { ...shop, whitelist: [UI_KIT.key] };
  return { ...pipeline, entities };
}

/** Ticket `001` of `entity` in progress, its build job launched at stage 1 in the root tracker of a scratch copy of the fixture's places. */
function launchedBuildOf(entity: EntityForgeEntity, ticketReview: TicketReview = 'on', pipelineOf: (stored: Pipeline) => Pipeline = (stored) => stored): ForgeBuild {
  const repository = createScratchDirectory('entity-forge-build');
  folders.push(repository);
  const trackerDirectory = join(repository, PRODUCT_NAMES.DATA_FOLDER);
  mkdirSync(trackerDirectory, { recursive: true });
  const ticket = ticketFixture({
    id: SHOP_TICKET.id, status: 'in-progress', task: 1, entity: entity.key
  });
  const storedPipeline = pipelineOf(storedPipelineIn(trackerDirectory));
  const pipeline = ticketReview === 'on' ? storedPipeline : { ...storedPipeline, approvals: { tickets: false } };
  const { board } = boardFixture({ tickets: [ticket], pipeline });
  board.setHephaestusState('running', AT);
  const { job } = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: [SHOP_TICKET.id], parentJobId: null, attempt: 1, target: ENTITY_FORGE_MAIN_LINE, entity: entity.key, stage: 1
  }, AT);
  const context = {
    workspace:         { rootDirectory: repository, trackerDirectory },
    mainLine:          ENTITY_FORGE_MAIN_LINE,
    branchNames:       branchNamesOf(null),
    log:               () => undefined,
    platformPorts:     { dataFolders: { pathModule: path, foldsCase: false } },
    agentAdapter:      fakeAgentAdapter(),
    decisionWordingOf: () => WORDING,
  } as unknown as JobLaunchContext;
  mkdirSync(WorktreeJobs.worktreeOf(context.workspace, job), { recursive: true });
  const jobFolder = jobFolderIn(trackerDirectory, job.id);
  mkdirSync(jobFolder, { recursive: true });
  return {
    board, job, context, jobFolder, repository
  };
}

/** The red handoff an earlier Customs check or gate left in the job's folder. */
function leaveARedHandoff({ jobFolder }: ForgeBuild, kind: RedHandoffFacts['kind'], name: string, scopeResumed: boolean): void {
  RedHandoff.writeRedHandoff(jobFolder, {
    kind,
    name,
    command:             null,
    fixCommand:          null,
    commit:              '',
    exitCode:            null,
    gateFailureNotePath: RedHandoff.gateFailureNotePathOf(jobFolder),
    fullLogPath:         null,
    resume:              1,
    resumesAllowed:      LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    interruptedInstance: 1,
    callBudget:          50,
    ...(scopeResumed ? { scopeResumed: true as const } : {}),
  }, `${name} went red`);
}

/** Hands the build's report to the hold in `scenario`, claiming the shop's gate on its head; its failure cause, else its state. */
function verify(build: ForgeBuild, scenario: EntityForgeScenario, outcome: 'built' | 'needs-declared' = 'built'): string {
  const {
    board, job, context, jobFolder, repository
  } = build;
  const commits = commitsOf(scenario);
  enterScenario(scenario, { repositoryDirectory: repository, commits });
  const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
  const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === SHOP_TICKET.id);
  const jobStart = { startCommit: commits['<start>'], contentHashAtLaunch: ticket?.frontmatter.contentHash ?? '', launchSnapshot: launchSnapshotOf(worktree) };
  writeFileSync(join(jobFolder, 'start.json'), JSON.stringify({ version: JOB_START_FORMAT_VERSION, ...jobStart }));
  for (const state of ['preparing', 'running', 'in-customs'] as const) board.moveJob(job.id, state, AT);
  const headCommit = GitProcess.resolvedCommitOf(worktree, 'HEAD');
  BuildJobPass.applyBuildJobObservations({
    board, at: AT, workspace: context.workspace, records: createLocalRecordAllocation(context.workspace, board, NO_UNREADABLE_RECORDS, NO_LISTED_TICKET_LOCATIONS)
  } as unknown as BoardTransaction, context, [{
    jobId:           job.id,
    setup:           'installed',
    installStepRuns: [],
    calls:           1,
    report:          {
      role:              'builder',
      outcome,
      headCommit,
      acceptance:        [{ item: 'A1', state: 'met', evidence: 'ExamplePage.spec.ts' }],
      alsoFixed:         [],
      gates:             [{ name: 'verify', commit: headCommit }],
      handoff:           'Example handoff.',
      blockedReason:     null,
      cannotBuildReason: null,
    },
    agentEnd:         null,
    gate:             { verdict: 'pending' },
    sandboxRefusal:   null,
    targetCatchUp:    { verdict: 'not-checked' },
    mainMerge:        null,
    conflictReReview: null
  }]);
  const ended = board.logRecordsSoFar().find((record) => record.kind === 'job-ended' && record.jobId === job.id);
  if (ended?.kind === 'job-ended') return `${ended.fields.outcome}: ${ended.fields.cause ?? ''}`;
  const state = board.jobs().find((candidate) => candidate.id === job.id)?.state ?? 'gone';
  return state === 'interrupted' ? `${state}: ${keptRedHandoffOf(jobFolder)?.name ?? ''}` : state;
}

function followThePlaybook(board: Board): readonly PlaybookStep[] {
  return board.followPlaybook({ ...LIFECYCLE_LIMITS, now: AT, usageResetsAt: null }, {
    mainLine:                     ENTITY_FORGE_MAIN_LINE,
    groupTargetPrefix:            'group-',
    installVersionChanged:        false,
    ticketIdsTouchingAgentConfig: [],
    closedDeliveryTurns:          [],
    budgetSpentDeliveryTurns:     [],
    assistantHasAnswered:         false,
    assistantBootRetryDue:        false,
  }, () => WORDING).steps;
}

function launchedTicketIdsOf(board: Board): string[] {
  return followThePlaybook(board).flatMap((step) => (step.kind === 'launch-build' || step.kind === 'launch-review' ? [step.ticketId] : []));
}

function decisionsOf(board: Board): [string, readonly string[]][] {
  return board.decisions().map((decision) => [decision.kind, decision.ticketIds]);
}

describeWhenGitIsRecorded('a build of the shop judged by its entity', () => {
  test('reaches its gates when it changed only the shop\'s files', () => {
    expect(verify(launchedBuildOf(SHOP), ENTITY_FORGE_SCENARIOS.SHOP_TICKET_AT_HOME)).toBe('gating');
  });

  test('that also changed the admin app\'s files is sent back once, its restart naming them (E11)', () => {
    const build = launchedBuildOf(SHOP);
    expect(verify(build, ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_ADMIN)).toBe('interrupted: V17');
    expect(readFileSync(RedHandoff.gateFailureNotePathOf(build.jobFolder), 'utf8')).toContain(`changed-outside-home-and-reach\n${sourceFileOf(ADMIN)}`);
    expect(keptRedHandoffOf(build.jobFolder)?.scopeResumed).toBe(true);
  });

  test('sent back once for V17 whose branch still changes the admin app\'s files fails, with no decision (E11)', () => {
    const build = launchedBuildOf(SHOP);
    leaveARedHandoff(build, 'customs', 'V17', true);
    expect(verify(build, ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_ADMIN)).toBe('failed: changed-outside-home-and-reach');
    expect(build.board.decisions()).toEqual([]);
  });

  test('sent back for V17 and then for a red gate is not sent back for V17 again (E11)', () => {
    const build = launchedBuildOf(SHOP);
    leaveARedHandoff(build, 'gate', 'verify', true);
    expect(verify(build, ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_ADMIN)).toBe('failed: changed-outside-home-and-reach');
  });

  test('sent back for a V17 whose git failed still gets its one V17 resume (E11)', () => {
    const build = launchedBuildOf(SHOP);
    leaveARedHandoff(build, 'customs', 'V17', false);
    expect(verify(build, ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_ADMIN)).toBe('interrupted: V17');
  });

  test('sent back for a red gate only still gets its one V17 resume (E11)', () => {
    const build = launchedBuildOf(SHOP);
    leaveARedHandoff(build, 'gate', 'verify', false);
    expect(verify(build, ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_ADMIN)).toBe('interrupted: V17');
  });

  test('E6: a new root folder is the root entity\'s until an entity names it, so the shop\'s build that creates it is sent back once', () => {
    const build = launchedBuildOf(SHOP, 'on', withoutTheAdminApp);
    const entities = build.board.pipeline()?.entities ?? {};
    expect(EntityOwnershipUtil.ownerOf(entities, '/packages/new/Example.ts')).toBe(ROOT.key);
    expect(EntityOwnershipUtil.ownerOf(entities, `/${sourceFileOf(ADMIN)}`)).toBe(ROOT.key);
    expect(EntityOwnershipUtil.ownerOf(entityForgePipelineOf('strict-isolation').entities ?? {}, `/${sourceFileOf(ADMIN)}`)).toBe(ADMIN.key);

    expect(verify(build, ENTITY_FORGE_SCENARIOS.SHOP_TICKET_INTO_ADMIN)).toBe('interrupted: V17');
    expect(readFileSync(RedHandoff.gateFailureNotePathOf(build.jobFolder), 'utf8')).toContain(`changed-outside-home-and-reach\n${sourceFileOf(ADMIN)}`);
  });

  test('E8: that changed the package\'s constitution, which its ticket names, is sent back once, then fails', () => {
    const build = launchedBuildOf(SHOP, 'on', withTheShopCrossingIntoTheUiKit);
    build.board.editTicket(SHOP_TICKET.id, NAMING_THE_UI_KIT_CONSTITUTION, AT);
    expect(verify(build, ENTITY_FORGE_SCENARIOS.CONSTITUTION_PROPOSED)).toBe('interrupted: V17');
    expect(readFileSync(RedHandoff.gateFailureNotePathOf(build.jobFolder), 'utf8')).toContain(`constitution-outside-ticket-entity\n${constitutionFileOf(UI_KIT)}`);

    const sentBack = launchedBuildOf(SHOP, 'on', withTheShopCrossingIntoTheUiKit);
    sentBack.board.editTicket(SHOP_TICKET.id, NAMING_THE_UI_KIT_CONSTITUTION, AT);
    leaveARedHandoff(sentBack, 'customs', 'V17', true);
    expect(verify(sentBack, ENTITY_FORGE_SCENARIOS.CONSTITUTION_PROPOSED)).toBe('failed: constitution-outside-ticket-entity');
  });

  test('that changed only the admin app\'s files is sent back once, then fails and opens work-in-other-entity, which holds it (E15)', () => {
    const build = launchedBuildOf(SHOP);
    expect(verify(build, ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ONLY_ADMIN)).toBe('interrupted: V17');
    expect(readFileSync(RedHandoff.gateFailureNotePathOf(build.jobFolder), 'utf8')).toContain(`changed-only-outside-home-and-reach\n${sourceFileOf(ADMIN)}`);

    const sentBack = launchedBuildOf(SHOP);
    leaveARedHandoff(sentBack, 'customs', 'V17', true);
    expect(verify(sentBack, ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ONLY_ADMIN)).toBe('failed: changed-only-outside-home-and-reach');
    expect(decisionsOf(sentBack.board)).toEqual([['work-in-other-entity', [SHOP_TICKET.id]]]);
    expect(launchedTicketIdsOf(sentBack.board)).toEqual([]);
  });

  test('E15: opens work-in-other-entity offering the entity that owns the changed files', () => {
    const sentBack = launchedBuildOf(SHOP);
    const drafts: DecisionDraft[] = [];
    const context = {
      ...sentBack.context,
      decisionWordingOf: (draft: DecisionDraft) => {
        drafts.push(draft);
        return WORDING;
      }
    } as JobLaunchContext;
    leaveARedHandoff(sentBack, 'customs', 'V17', true);
    verify({ ...sentBack, context }, ENTITY_FORGE_SCENARIOS.SHOP_TICKET_ONLY_ADMIN);

    expect(drafts).toEqual([{
      kind: 'work-in-other-entity', ticketIds: [SHOP_TICKET.id], jobId: null, subject: { owningEntities: [ADMIN.key], paths: [sourceFileOf(ADMIN)] }
    }]);
  });
});

/** The build of `entity` declares a need for `needEntity`, reports `needs-declared`, and the hold files it. */
function declaredNeedOf(entity: EntityForgeEntity, needEntity: EntityForgeEntity, ticketReview: TicketReview = 'on'): ForgeBuild & { whereTheJobWent: string } {
  const build = launchedBuildOf(entity, ticketReview);
  build.board.declareNeed(build.job.id, { entity: needEntity.key, title: `Change ${needEntity.key} for ${entity.key}`, body: NEED_BODY }, () => []);
  return { ...build, whereTheJobWent: verify(build, ENTITY_FORGE_SCENARIOS.SHOP_TICKET_AT_HOME, 'needs-declared') };
}

function ticketOf(board: Board, ticketId: string) {
  return board.tickets().find((ticket) => ticket.frontmatter.id === ticketId);
}

describeWhenGitIsRecorded('a need the shop\'s build declares', () => {
  test('for the root entity, which has no gates, files no ticket and opens need-for-root, which holds the shop\'s ticket (E12)', () => {
    const declared = declaredNeedOf(SHOP, ROOT);
    expect(declared.whereTheJobWent).toBe('needs-declared: ');
    expect(declared.board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual([SHOP_TICKET.id]);
    expect(decisionsOf(declared.board)).toEqual([['need-for-root', [SHOP_TICKET.id]]]);
    expect(launchedTicketIdsOf(declared.board)).toEqual([]);
  });

  test('of the package\'s build for the shop, which consumes the package, files no ticket and opens need-closes-circle (E13)', () => {
    const declared = declaredNeedOf(UI_KIT, SHOP);
    expect(declared.whereTheJobWent).toBe('needs-declared: ');
    expect(declared.board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual([SHOP_TICKET.id]);
    expect(decisionsOf(declared.board)).toEqual([['need-closes-circle', [SHOP_TICKET.id]]]);
    expect(launchedTicketIdsOf(declared.board)).toEqual([]);
  });

  test('for the admin app is filed as the admin app\'s ticket, which waits for the owner with ticket review on and holds the shop\'s ticket', () => {
    const declared = declaredNeedOf(SHOP, ADMIN);
    expect(ticketOf(declared.board, NEED_TICKET.id)?.frontmatter).toMatchObject({ entity: ADMIN.key, filedByJob: declared.job.id, status: 'ready-for-review' });
    expect(ticketOf(declared.board, SHOP_TICKET.id)?.frontmatter).toMatchObject({ status: 'in-progress', dependsOn: [NEED_TICKET.id] });
    expect(launchedTicketIdsOf(declared.board)).toEqual([]);
  });

  test('for the admin app with ticket review off runs the admin app\'s ticket first, then the shop\'s stage again once it is delivered', () => {
    const declared = declaredNeedOf(SHOP, ADMIN, 'off');
    expect(ticketOf(declared.board, NEED_TICKET.id)?.frontmatter).toMatchObject({ entity: ADMIN.key, status: 'committed' });
    expect(launchedTicketIdsOf(declared.board)).toEqual([NEED_TICKET.id]);

    declared.board.endJob(declared.board.jobs().find((job) => job.kind === 'build')?.id ?? '', { outcome: 'stopped' }, AT);
    declared.board.moveTicket(NEED_TICKET.id, 'delivered', { checksLegality: false }, AT);
    expect(launchedTicketIdsOf(declared.board)).toEqual([SHOP_TICKET.id]);
  });

  test('for the admin app, once that ticket is abandoned, leaves the shop\'s ticket held by need-abandoned (E14)', () => {
    const declared = declaredNeedOf(SHOP, ADMIN, 'off');
    declared.board.moveTicket(NEED_TICKET.id, 'abandoned', { checksLegality: false, reason: 'Alex Example dropped it' }, AT);
    followThePlaybook(declared.board);

    expect(ticketOf(declared.board, SHOP_TICKET.id)?.frontmatter.dependsOn).toBeUndefined();
    expect(decisionsOf(declared.board)).toEqual([['need-abandoned', [SHOP_TICKET.id]]]);
    expect(launchedTicketIdsOf(declared.board)).toEqual([]);
  });
});
