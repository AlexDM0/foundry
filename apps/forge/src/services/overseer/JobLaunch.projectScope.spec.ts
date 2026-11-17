/**
 * The Customs subject a build job's hold builds for a tracker in a folder of its repository, and the V13 check before a launch. What
 * matters: the subject carries the tracker's prefix and the pipeline's `reach`, so V17 refuses a branch that changed a file outside the
 * project's folder and its reach, and passes it once the reach names that file; a tracker at its repository's root, its subject without a
 * scope, passes the same branch to its gates. Before a launch a folder tracker's branch that committed `.claude/` inside the project's
 * folder holds its ticket, while a root tracker, which protects `.claude/` only at the root as always, launches it. On a pipeline with
 * entities, a job of an entity is held to its entity's homes and `reach`, and a change outside them sends its session back on a red
 * handoff to take the change out, where a folder tracker's job fails; that handoff's Baton pass names the paths to take out. A job of an
 * entity is told its entity's gates, each folder from the project's folder, and Customs V15 holds it to exactly those. A job without an
 * entity keeps the checks it always had, and before a launch `.claude/` in every entity home holds the ticket. A `needs-declared` report
 * never reaches the gates: a job of an entity ends with that outcome, a job without one fails as before. The folders are real,
 * with a `.git` folder above the project so its prefix is read from disk; git answers from recorded scenarios.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path, { join }                             from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { GitProcess }                                     from '../../lib/git/GitProcess.ts';
import type { Job }                                       from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline, PipelineEntity }                  from '../../lib/tracker-model/@types/Pipeline.ts';
import type { Ticket }                                    from '../../lib/tracker-model/@types/Ticket.ts';
import type { Board }                                     from '../../lib/tracker-model/Board.ts';
import { PipelineUtil }                                   from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { TicketBodyHashUtil }                             from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { branchNamesOf }                                  from '../../shared/BranchNames.ts';
import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture }                    from '../../testing/BoardFixtures.ts';
import { useRecordedGit }                                 from '../../testing/RecordedGit.ts';
import { GIT_SCENARIOS }                                  from '../../testing/RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                          from '../../testing/ToolGuard.ts';
import { definitionFileMatcherOf, launchSnapshotOf }      from '../lifecycle/Customs.ts';
import type { TrackerChange }                             from '../tracker/TrackerPipeline.ts';
import { JobLaunch, type JobLaunchContext }               from './JobLaunch.ts';
import { RedHandoff }                                     from './RedHandoff.ts';
import { WatcherFleet }                                   from './WatcherFleet.ts';

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
    workspace:     { rootDirectory, trackerDirectory },
    mainLine:      MAIN_LINE,
    branchNames:   branchNamesOf(place === 'in a folder' ? 'example' : null),
    log:           () => undefined,
    platformPorts: { dataFolders: { pathModule: path, foldsCase: false } },
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
}

/** Hands a build job's built report, claiming `claimedGates` on its head, to the hold, which verifies it. */
function verifyBuild(place: TrackerPlace, pipeline?: Pipeline, entity?: string, claimedGates: readonly string[] = [],
  outcome: 'built' | 'needs-declared' = 'built'): VerifiedBuild {
  const {
    board, job, ticket, context, trackerDirectory, worktree
  } = launchedBuildOf(place, pipeline, entity);
  enterScenario(GIT_SCENARIOS.MAIN_INSTRUCTION_FILE_MERGED, { repositoryDirectory: worktree, commits: SCENARIO_COMMITS });
  const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, job.id);
  mkdirSync(jobFolder, { recursive: true });
  const jobStart = { startCommit: SCENARIO_COMMITS['<start>'], bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(ticket.body), launchSnapshot: launchSnapshotOf(worktree) };
  writeFileSync(join(jobFolder, 'start.json'), JSON.stringify(jobStart));
  for (const state of ['preparing', 'running', 'in-customs'] as const) board.moveJob(job.id, state, AT);
  const headCommit = GitProcess.resolvedCommitOf(worktree, 'HEAD');
  JobLaunch.applyBuildJobObservations({ board, at: AT } as unknown as TrackerChange, context, [{
    jobId:  job.id,
    setup:  'installed',
    calls:  1,
    report: {
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
  return { whereTheJobWent: whereTheJobWent(board, job.id, jobFolder), jobFolder };
}

function verifiedBuildOf(place: TrackerPlace, pipeline?: Pipeline, entity?: string, claimedGates?: readonly string[]): string {
  return verifyBuild(place, pipeline, entity, claimedGates).whereTheJobWent;
}

/** An interrupted job names the check its red handoff sends the session back to. */
function whereTheJobWent(board: Board, jobId: string, jobFolder: string): string {
  const ended = board.logRecordsSoFar().find((record) => record.kind === 'job-ended' && record.jobId === jobId);
  if (ended?.kind === 'job-ended') return `${ended.fields.outcome}: ${ended.fields.cause ?? ''}`;
  const state = board.jobs().find((candidate) => candidate.id === jobId)?.state ?? 'gone';
  return state === 'interrupted' ? `${state}: ${RedHandoff.redHandoffFactsOf(jobFolder)?.name ?? ''}` : state;
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
  expect(readFileSync(RedHandoff.batonPassPathOf(build.jobFolder), 'utf8')).toContain(`changed-outside-home-and-reach\n${FILE_OUTSIDE_THE_PROJECT}`);
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

testWhenGitIsRecorded('a job of an entity whose report declares needs ends needs-declared and never reaches its gates', () => {
  expect(verifyBuild('at the root', pipelineWithEntities(), 'example', [], 'needs-declared').whereTheJobWent).toBe('needs-declared: ');
});

testWhenGitIsRecorded('a job without an entity whose report declares needs fails as it did before, without a report', () => {
  expect(verifyBuild('at the root', undefined, undefined, [], 'needs-declared').whereTheJobWent).toBe('failed: no-report');
});
