/**
 * The Customs subject a build job's hold builds for a tracker in a folder of its repository, and the V13 check before a launch. What
 * matters: the subject carries the tracker's prefix and the pipeline's `reach`, so V17 refuses a branch that changed a file outside the
 * project's folder and its reach, and passes it once the reach names that file; a tracker at its repository's root, its subject without a
 * scope, passes the same branch to its gates. Before a launch a folder tracker's branch that committed `.claude/` inside the project's
 * folder holds its ticket, while a root tracker, which protects `.claude/` only at the root as always, launches it. The folders are real,
 * with a `.git` folder above the project so its prefix is read from disk; git answers from recorded scenarios.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path, { join }               from 'node:path';

import { afterEach, expect } from 'bun:test';

import { GitProcess }                                     from '../../lib/git/GitProcess.ts';
import type { Job }                                       from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }                                  from '../../lib/tracker-model/@types/Pipeline.ts';
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
import { launchSnapshotOf }                               from '../lifecycle/Customs.ts';
import type { TrackerChange }                             from '../tracker/TrackerPipeline.ts';
import { JobLaunch, type JobLaunchContext }               from './JobLaunch.ts';
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
function launchedBuildOf(place: TrackerPlace, pipeline?: Pipeline): LaunchedBuild {
  const repositoryDirectory = createScratchDirectory('job-launch-project-scope');
  folders.push(repositoryDirectory);
  const rootDirectory = place === 'in a folder' ? join(repositoryDirectory, PROJECT_PREFIX) : repositoryDirectory;
  if (place === 'in a folder') mkdirSync(join(repositoryDirectory, '.git'), { recursive: true });
  const trackerDirectory = join(rootDirectory, PRODUCT_NAMES.DATA_FOLDER);
  const ticket = ticketFixture({ id: '001', status: 'in-progress', task: 1 });
  const { board } = boardFixture({ tickets: [ticket], ...(pipeline === undefined ? {} : { pipeline }) });
  const { job } = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: MAIN_LINE
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

/** Hands a build job's built report to the hold, which verifies it, and answers where the job went: its failure cause, or its state. */
function verifiedBuildOf(place: TrackerPlace, pipeline?: Pipeline): string {
  const {
    board, job, ticket, context, trackerDirectory, worktree
  } = launchedBuildOf(place, pipeline);
  enterScenario(GIT_SCENARIOS.MAIN_INSTRUCTION_FILE_MERGED, { repositoryDirectory: worktree, commits: SCENARIO_COMMITS });
  const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, job.id);
  mkdirSync(jobFolder, { recursive: true });
  const jobStart = { startCommit: SCENARIO_COMMITS['<start>'], bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(ticket.body), launchSnapshot: launchSnapshotOf(worktree) };
  writeFileSync(join(jobFolder, 'start.json'), JSON.stringify(jobStart));
  for (const state of ['preparing', 'running', 'in-customs'] as const) board.moveJob(job.id, state, AT);
  JobLaunch.applyBuildJobObservations({ board, at: AT } as unknown as TrackerChange, context, [{
    jobId:  job.id,
    setup:  'installed',
    calls:  1,
    report: {
      role:              'builder',
      outcome:           'built',
      headCommit:        GitProcess.resolvedCommitOf(worktree, 'HEAD'),
      acceptance:        [{ item: 'A1', state: 'met', evidence: 'ExamplePage.spec.ts' }],
      alsoFixed:         [],
      gates:             [],
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
  return whereTheJobWent(board, job.id);
}

function whereTheJobWent(board: Board, jobId: string): string {
  const ended = board.logRecordsSoFar().find((record) => record.kind === 'job-ended' && record.jobId === jobId);
  if (ended?.kind === 'job-ended') return `${ended.fields.outcome}: ${ended.fields.cause ?? ''}`;
  return board.jobs().find((candidate) => candidate.id === jobId)?.state ?? 'gone';
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
