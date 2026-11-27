/**
 * The Customs subject a build job's hold builds for a tracker in a folder of its repository, and the V13 check before a launch. What matters: the
 * subject carries the tracker's prefix and the pipeline's `reach`, so V17 refuses a branch that changed a file outside the project's folder and its
 * reach, and passes it once the reach names that file; a tracker at its repository's root, its subject without a scope, passes the same branch to its
 * gates. Before a launch a folder tracker's branch that committed `.claude/` inside the project's folder holds its ticket, while a root tracker, which
 * protects `.claude/` only at the root as always, launches it. On a pipeline with entities, a job of an entity is held to its entity's homes and
 * `reach`, and a change outside them sends its session back on a red handoff to take the change out, where a folder tracker's job fails; that handoff's
 * restart names the paths to take out. A job of an entity is told its entity's gates, each folder from the project's folder, and Customs V15 holds
 * it to exactly those. A job without an entity keeps the checks it always had, and before a launch `.claude/` in every entity home holds the ticket. A
 * `needs-declared` report never reaches the gates: a job of an entity files its kept needs as tickets and ends with that outcome, one that kept none
 * fails, and a job without an entity fails as before. A session sent back once for V17 whose branch still changed only another entity's files opens
 * `work-in-other-entity` (E15); one sent back for a red gate gets its V17 resume first. The folders are real, with a `.git` folder above the project so
 * its prefix is read from disk; git answers from recorded scenarios.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path, { join }                             from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { JOB_START_FORMAT_VERSION }                          from '../../adapters/job-start/JobStartIngestion.ts';
import type { RedHandoffFacts }                              from '../../adapters/red-handoff/RedHandoffIngestion.ts';
import type { Job }                                          from '../../domain/tracker-model/@types/Job.ts';
import type { Pipeline, PipelineEntity }                     from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Ticket }                                       from '../../domain/tracker-model/@types/Ticket.ts';
import type { Board }                                        from '../../domain/tracker-model/Board.ts';
import { PipelineUtil }                                      from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { GitProcess }                                        from '../../lib/git/GitProcess.ts';
import { branchNamesOf }                                     from '../../shared/BranchNames.ts';
import { PRODUCT_NAMES }                                     from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture }                       from '../../testing/BoardFixtures.ts';
import { fakeAgentAdapter }                                  from '../../testing/FakeAgentAdapter.ts';
import { NO_LISTED_TICKET_LOCATIONS, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import { useRecordedGit }                                    from '../../testing/RecordedGit.ts';
import { GIT_SCENARIOS }                                     from '../../testing/RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory }    from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                             from '../../testing/ToolGuard.ts';
import { definitionFileMatcherOf }                           from '../lifecycle/CustomsDefinitionFilesCheck.ts';
import { launchSnapshotOf }                                  from '../lifecycle/CustomsLaunchSnapshot.ts';
import type { BoardTransaction }                             from '../tracker/BoardTransaction.ts';
import { createLocalRecordAllocation }                       from '../tracker/LocalRecordAllocation.ts';
import { jobFolderIn }                                       from './HephaestusFiles.ts';
import { JobLaunch, type JobLaunchContext }                  from './JobLaunch.ts';
import { RedHandoff }                                        from './RedHandoff.ts';
import { keptRedHandoffOf }                                  from './testing/KeptRedHandoff.ts';

const AT = '2026-11-16T10:00:00+01:00';
const MAIN_LINE = 'main';
const PROJECT_PREFIX = 'apps/example';
/** The file the scenario's branch commits at the repository's root, outside the project's folder. */
const FILE_OUTSIDE_THE_PROJECT = 'feature.ts';

const SCENARIO_COMMITS = { '<start>': '1'.repeat(40), '<main tip>': '8'.repeat(40), '<head>': '6'.repeat(40) };

const { enterScenario } = useRecordedGit();

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

type TrackerPlace = 'in a folder' | 'at the root';

interface LaunchedBuild {
  readonly board:            Board;
  readonly job:              Readonly<Job>;
  readonly ticket:           Readonly<Ticket>;
  readonly context:          JobLaunchContext;
  readonly trackerDirectory: string;
  readonly worktree:         string;
}

/** A build job launched on ticket 001 for a tracker in a folder or at the root, its worktree folder made on disk. */
function launchedBuildOf(place: TrackerPlace, pipeline?: Pipeline, entity?: string): LaunchedBuild {
  const repositoryDirectory = createScratchDirectory('job-launch-project-scope');
  folders.push(repositoryDirectory);
  const rootDirectory = place === 'in a folder' ? join(repositoryDirectory, PROJECT_PREFIX) : repositoryDirectory;
  if (place === 'in a folder') mkdirSync(join(repositoryDirectory, '.git'), { recursive: true });
  const trackerDirectory = join(rootDirectory, PRODUCT_NAMES.DATA_FOLDER);
  const ticket = ticketFixture({ id: '001', status: 'in-progress', task: 1 });
  const { board } = boardFixture({ tickets: [ticket], ...(pipeline === undefined ? {} : { pipeline }) });
  const { job } = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: MAIN_LINE, ...(entity === undefined ? {} : { entity, stage: 1 })
  }, AT);
  const context = {
    workspace:         { rootDirectory, trackerDirectory },
    mainLine:          MAIN_LINE,
    branchNames:       branchNamesOf(place === 'in a folder' ? 'example' : null),
    log:               () => undefined,
    platformPorts:     { dataFolders: { pathModule: path, foldsCase: false } },
    agentAdapter:      fakeAgentAdapter(),
    decisionWordingOf: () => ({
      questions: [{
        question: 'Example decision?', header: 'example', multiSelect: false, options: []
      }],
      context: ''
    }),
  } as unknown as JobLaunchContext;
  const worktree = JobLaunch.worktreeOf(context.workspace, job);
  mkdirSync(worktree, { recursive: true });
  return {
    board, job, ticket, context, trackerDirectory, worktree
  };
}

interface VerifiedBuild {
  /** Its failure cause, or its state. */
  readonly whereTheJobWent: string;
  readonly jobFolder:       string;
  readonly board:           Board;
}

/** Hands a build job's built report, claiming `claimedGates` on its head, to the hold, which verifies it; `prepare` runs before the hold. */
function verifyBuild(place: TrackerPlace, pipeline?: Pipeline, entity?: string, claimedGates: readonly string[] = [],
  outcome: 'built' | 'needs-declared' = 'built', prepare: (build: LaunchedBuild) => void = () => undefined): VerifiedBuild {
  const launched = launchedBuildOf(place, pipeline, entity);
  const {
    board, job, ticket, context, trackerDirectory, worktree
  } = launched;
  prepare(launched);
  enterScenario(GIT_SCENARIOS.MAIN_INSTRUCTION_FILE_MERGED, { repositoryDirectory: worktree, commits: SCENARIO_COMMITS });
  const jobFolder = jobFolderIn(trackerDirectory, job.id);
  mkdirSync(jobFolder, { recursive: true });
  const jobStart = { startCommit: SCENARIO_COMMITS['<start>'], contentHashAtLaunch: ticket.frontmatter.contentHash ?? '', launchSnapshot: launchSnapshotOf(worktree) };
  writeFileSync(join(jobFolder, 'start.json'), JSON.stringify({ version: JOB_START_FORMAT_VERSION, ...jobStart }));
  for (const state of ['preparing', 'running', 'in-customs'] as const) board.moveJob(job.id, state, AT);
  const headCommit = GitProcess.resolvedCommitOf(worktree, 'HEAD');
  JobLaunch.applyBuildJobObservations({
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
      gates:             claimedGates.map((name) => ({ name, commit: headCommit })),
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
  return { whereTheJobWent: whereTheJobWent(board, job.id, jobFolder), jobFolder, board };
}

function verifiedBuildOf(place: TrackerPlace, pipeline?: Pipeline, entity?: string, claimedGates?: readonly string[]): string {
  return verifyBuild(place, pipeline, entity, claimedGates).whereTheJobWent;
}

/** An interrupted job names the check its red handoff sends the session back to. */
function whereTheJobWent(board: Board, jobId: string, jobFolder: string): string {
  const ended = board.logRecordsSoFar().find((record) => record.kind === 'job-ended' && record.jobId === jobId);
  if (ended?.kind === 'job-ended') return `${ended.fields.outcome}: ${ended.fields.cause ?? ''}`;
  const state = board.jobs().find((candidate) => candidate.id === jobId)?.state ?? 'gone';
  return state === 'interrupted' ? `${state}: ${keptRedHandoffOf(jobFolder)?.name ?? ''}` : state;
}

testWhenGitIsRecorded('a folder tracker\'s build that changed a file outside its folder and its reach fails Customs V17', () => {
  expect(verifiedBuildOf('in a folder')).toBe('failed: changed-outside-home-and-reach');
});

testWhenGitIsRecorded('a folder tracker\'s build passes to its gates once the pipeline\'s reach names the file', () => {
  const pipeline: Pipeline = { ...PipelineUtil.minimalPipelineOf(), reach: [`/${FILE_OUTSIDE_THE_PROJECT}`] };
  expect(verifiedBuildOf('in a folder', pipeline)).toBe('gating');
});

testWhenGitIsRecorded('a tracker at its repository\'s root passes the same build to its gates, the whole repository being its home', () => {
  expect(verifiedBuildOf('at the root')).toBe('gating');
});

testWhenGitIsRecorded('before a launch, a folder tracker\'s branch that committed .claude/ inside the project\'s folder holds its ticket', () => {
  const { job, context, worktree } = launchedBuildOf('in a folder');
  enterScenario(GIT_SCENARIOS.TICKET_BRANCH_NESTS_AGENT_CONFIG, { repositoryDirectory: worktree, commits: SCENARIO_COMMITS });
  expect(JobLaunch.ticketIdsTouchingAgentConfigOf(context, [job])).toEqual(['001']);
});

testWhenGitIsRecorded('before a launch, a root tracker launches the same branch, its .claude/ protected only at the repository\'s root', () => {
  const { job, context, worktree } = launchedBuildOf('at the root');
  enterScenario(GIT_SCENARIOS.TICKET_BRANCH_NESTS_AGENT_CONFIG, { repositoryDirectory: worktree, commits: SCENARIO_COMMITS });
  expect(JobLaunch.ticketIdsTouchingAgentConfigOf(context, [job])).toEqual([]);
});

/** An entity with no steps or gates of its own, at `home`. */
function entityAt(kind: PipelineEntity['kind'], home: string, reach?: string[]): PipelineEntity {
  return {
    kind, home: [home], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, ...(reach === undefined ? {} : { reach })
  };
}

/** A top-level forge: the root entity, the example app whose folder the scenarios name, and a package. */
function pipelineWithEntities(exampleReach?: string[], exampleGates: PipelineEntity['gates'] = []): Pipeline {
  const example = entityAt('app', `/${PROJECT_PREFIX}`, exampleReach);
  return {
    ...PipelineUtil.minimalPipelineOf(),
    entities: {
      root:    entityAt('root', '/'),
      example: { ...example, gates: exampleGates, phases: { build: exampleGates.map((gate) => gate.name), review: [], merge: [] } },
      shared:  entityAt('package', '/packages/shared'),
    },
  };
}

testWhenGitIsRecorded('a job of an entity that changed a file outside its homes and reach is sent back on a red handoff, not failed', () => {
  const build = verifyBuild('at the root', pipelineWithEntities(), 'example');
  expect(build.whereTheJobWent).toBe('interrupted: V17');
  expect(readFileSync(RedHandoff.gateFailureNotePathOf(build.jobFolder), 'utf8')).toContain(`changed-only-outside-home-and-reach\n${FILE_OUTSIDE_THE_PROJECT}`);
});

describe('a job of an entity with a gate', () => {
  const unitGate = { name: 'unit', run: 'bun test', definedBy: ['package.json', 'config/unit.json', '/bunfig.toml'] };
  const pipeline = pipelineWithEntities([`/${FILE_OUTSIDE_THE_PROJECT}`], [unitGate]);

  test('is told its entity\'s gate, its folder the entity\'s home from the project\'s folder', () => {
    const definedBy = [`/${PROJECT_PREFIX}/**/package.json`, `/${PROJECT_PREFIX}/config/unit.json`, '/bunfig.toml'];
    expect(JobLaunch.sessionGatesOf(pipeline, { entity: 'example' })).toEqual([{ ...unitGate, in: PROJECT_PREFIX, definedBy }]);
  });

  test('protects the definition files of its entity\'s home, not the root\'s files of the same name', () => {
    const [gate] = JobLaunch.sessionGatesOf(pipeline, { entity: 'example' });
    const definitionFileMatchers = (gate?.definedBy ?? []).map((pattern) => definitionFileMatcherOf(pattern, ''));
    const protectedPaths = [`${PROJECT_PREFIX}/package.json`, `${PROJECT_PREFIX}/tools/package.json`, 'package.json', 'config/unit.json', 'bunfig.toml']
      .filter((repositoryPath) => definitionFileMatchers.some((matches) => matches(repositoryPath)));
    expect(protectedPaths).toEqual([`${PROJECT_PREFIX}/package.json`, `${PROJECT_PREFIX}/tools/package.json`, 'bunfig.toml']);
  });

  test('of the root entity keeps the gate as stored, its folder the project\'s', () => {
    const rootEntity: PipelineEntity = { ...entityAt('root', '/'), gates: [unitGate], phases: { build: [unitGate.name], review: [], merge: [] } };
    const rootPipeline: Pipeline = { ...pipeline, entities: { ...pipeline.entities, root: rootEntity } };
    expect(JobLaunch.sessionGatesOf(rootPipeline, { entity: 'root' })).toEqual([unitGate]);
  });

  test('without an entity is told the pipeline\'s own gates, as stored', () => {
    expect(JobLaunch.sessionGatesOf(pipeline, {})).toBe(pipeline.gates);
  });

  testWhenGitIsRecorded('fails Customs V15 with the gate unclaimed and is sent back on a red handoff', () => {
    expect(verifiedBuildOf('at the root', pipeline, 'example')).toBe('interrupted: V15');
  });

  testWhenGitIsRecorded('passes to its gates once its report claims the gate on its head', () => {
    expect(verifiedBuildOf('at the root', pipeline, 'example', [unitGate.name])).toBe('gating');
  });
});

testWhenGitIsRecorded('a job of an entity passes to its gates once its entity\'s reach names the file', () => {
  expect(verifiedBuildOf('at the root', pipelineWithEntities([`/${FILE_OUTSIDE_THE_PROJECT}`]), 'example')).toBe('gating');
});

testWhenGitIsRecorded('a job of the root entity passes the same build, the file being the root\'s', () => {
  expect(verifiedBuildOf('at the root', pipelineWithEntities(), 'root')).toBe('gating');
});

testWhenGitIsRecorded('a job without an entity on a pipeline with entities keeps today\'s checks: V17 asks it nothing', () => {
  expect(verifiedBuildOf('at the root', pipelineWithEntities())).toBe('gating');
});

testWhenGitIsRecorded('before a launch, a root tracker with entities holds a branch that committed .claude/ in an entity home', () => {
  const { job, context, worktree } = launchedBuildOf('at the root', pipelineWithEntities(), 'example');
  enterScenario(GIT_SCENARIOS.TICKET_BRANCH_NESTS_AGENT_CONFIG, { repositoryDirectory: worktree, commits: SCENARIO_COMMITS });
  expect(JobLaunch.ticketIdsTouchingAgentConfigOf(context, [job], pipelineWithEntities())).toEqual(['001']);
});

const NEED_BODY = '## Acceptance\n\nA1. The example app reads the basket total.\n\n## Brief\n\nAlex Example needs the total.\n';

function declareANeed({ board, job }: LaunchedBuild): void {
  board.declareNeed(job.id, { entity: 'shared', title: 'Export the basket total', body: NEED_BODY }, () => []);
}

testWhenGitIsRecorded('a job of an entity whose report declares needs files them, ends needs-declared and never reaches its gates', () => {
  const build = verifyBuild('at the root', pipelineWithEntities(), 'example', [], 'needs-declared', declareANeed);
  const needTicket = build.board.tickets().find((ticket) => ticket.frontmatter.filedByJob === 'J1');
  expect(build.whereTheJobWent).toBe('needs-declared: ');
  expect(needTicket?.frontmatter).toMatchObject({ entity: 'shared', title: 'Export the basket total', status: 'ready-for-review' });
  expect(build.board.tickets().find((ticket) => ticket.frontmatter.id === '001')?.frontmatter.dependsOn).toEqual([needTicket?.frontmatter.id ?? 'no need ticket']);
  expect(build.board.needs()).toEqual([]);
});

testWhenGitIsRecorded('a job of an entity whose needs-declared report kept no need fails without a report', () => {
  expect(verifyBuild('at the root', pipelineWithEntities(), 'example', [], 'needs-declared').whereTheJobWent).toBe('failed: no-report');
});

/** The red handoff an earlier refusal left: after a V17 scope refusal the session verified now is the one sent back to take its change out. */
function leaveARedHandoff(kind: RedHandoffFacts['kind'], name: string, scopeResumed: boolean): (build: LaunchedBuild) => void {
  return ({ context, job }) => {
    const jobFolder = jobFolderIn(context.workspace.trackerDirectory, job.id);
    mkdirSync(jobFolder, { recursive: true });
    RedHandoff.writeRedHandoff(jobFolder, {
      kind,
      name,
      command:             null,
      fixCommand:          null,
      commit:              SCENARIO_COMMITS['<head>'],
      exitCode:            null,
      gateFailureNotePath: RedHandoff.gateFailureNotePathOf(jobFolder),
      fullLogPath:         null,
      resume:              1,
      resumesAllowed:      2,
      interruptedInstance: 1,
      callBudget:          50,
      ...(scopeResumed ? { scopeResumed: true as const } : {}),
    }, `${name} went red`);
  };
}

testWhenGitIsRecorded('a session sent back once whose branch still changed only another entity\'s files opens work-in-other-entity and fails', () => {
  const build = verifyBuild('at the root', pipelineWithEntities(), 'example', [], 'built', leaveARedHandoff('customs', 'V17', true));
  expect(build.whereTheJobWent).toBe('failed: changed-only-outside-home-and-reach');
  expect(build.board.decisions().map((decision) => [decision.kind, decision.ticketIds, decision.context])).toEqual([['work-in-other-entity', ['001'], FILE_OUTSIDE_THE_PROJECT]]);
});

testWhenGitIsRecorded('a session sent back for a red gate whose branch then changed only another entity\'s files gets its one V17 resume', () => {
  const build = verifyBuild('at the root', pipelineWithEntities(), 'example', [], 'built', leaveARedHandoff('gate', 'unit', false));
  expect(build.whereTheJobWent).toBe('interrupted: V17');
  expect(build.board.decisions()).toEqual([]);
});

testWhenGitIsRecorded('a job without an entity whose report declares needs fails as it did before, without a report', () => {
  expect(verifyBuild('at the root', undefined, undefined, [], 'needs-declared').whereTheJobWent).toBe('failed: no-report');
});
