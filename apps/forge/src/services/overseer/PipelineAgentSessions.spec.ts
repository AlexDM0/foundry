/**
 * The pipeline agent as a session, on the Overseer's side. What matters: each turn end runs Customs on the setup's snapshot, and a refusal marks the
 * record's snapshot touched, which Apply refuses, and opens one incident, never a second one for the same touch; a resume clears the mark; with no
 * snapshot start the check fails closed; an agent no record names gets the incident alone. The record gives the agent's snapshot commit, its billing,
 * and the facts its first message is built from (the record and the installed default constitution), so a fresh session in place of a replaced one
 * starts from the same; a launch adds the record's snapshot at that commit, or checks an existing one out at it when a resume moved it, and takes the
 * snapshot start again. A snapshot no open record and no live agent holds is removed once per Overseer, and one the removal leaves is named as a
 * leftover. A namespaced tracker's turn end lets a ref outside its own move. Git answers from the recordings of `src/testing/RecordedGit.ts`
 * and the scenarios of `src/testing/RecordedGitScenarios.ts`, whose snapshot is setup S1's under a worktrees root at the repository.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import path, { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { REAL_WORKTREE_REMOVAL_PRIMITIVES, WORKTREE_REMOVAL_TRIES } from '../../lib/git/GitWorktrees.ts';
import type { Board }                                               from '../../lib/tracker-model/Board.ts';
import { branchNamesOf }                                            from '../../shared/BranchNames.ts';
import { boardFixture }                                             from '../../testing/BoardFixtures.ts';
import type { RecordedGitStep }                                     from '../../testing/RecordedGit.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit }   from '../../testing/RecordedGit.ts';
import { PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME }                      from '../../testing/RecordedGitScenarioCalls.ts';
import { GIT_SCENARIOS }                                            from '../../testing/RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory }           from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                    from '../../testing/ToolGuard.ts';
import { launchSnapshotOf }                                         from '../lifecycle/Customs.ts';
import type { TrackerChange }                                       from '../tracker/TrackerPipeline.ts';
import type { Workspace }                                           from '../tracker/Workspace.ts';
import { CONSTITUTION_DEFAULT_PATH }                                from './InstructionFiles.ts';
import { PIPELINE_AGENT_SNAPSHOT_FOLDER, PipelineAgentSessions }    from './PipelineAgentSessions.ts';
import { WatcherFleet }                                             from './WatcherFleet.ts';

const AT = '2026-10-31T12:00:00+01:00';
const SNAPSHOT_START_FILE = 'pipeline-agent-start.json';
const START_COMMIT = '1'.repeat(40);
const MOVED_COMMIT = '2'.repeat(40);
const SETUP_ID = 'S1';

const recordedGit = useRecordedGit();

let repositoryDirectory = '';
let trackerDirectory = '';

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('pipeline-agent-sessions');
  trackerDirectory = createScratchDirectory('pipeline-agent-tracker');
  mkdirSync(join(repositoryDirectory, '.git', 'hooks'), { recursive: true });
  mkdirSync(join(repositoryDirectory, PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME), { recursive: true });
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
  removeScratchDirectory(trackerDirectory);
});

function workspace(): Workspace {
  return { rootDirectory: repositoryDirectory, trackerDirectory } as unknown as Workspace;
}

function turnEndContext(branchNamespace: string | null = null) {
  return {
    workspace:     workspace(),
    worktreesRoot: repositoryDirectory,
    branchNames:   branchNamesOf(branchNamespace),
    mainLine:      'main',
    pathStyle:     { pathModule: path, foldsCase: false },
  };
}

function changeOf(board: Board): TrackerChange {
  return { board, at: AT, workspace: workspace() } as unknown as TrackerChange;
}

/** A first setup on API billing whose agent runs, its snapshot at the start commit. */
function boardWithSetupAgent(): { board: Board; jobId: string } {
  const { board } = boardFixture();
  board.openSetup({
    mode: 'setup', billing: { mode: 'api', maxBudgetUsd: 5 }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  }, AT);
  const { job } = board.startPipelineAgent(AT);
  board.attachSetupAgent(SETUP_ID, job.id, START_COMMIT);
  board.moveJob(job.id, 'running', AT);
  return { board, jobId: job.id };
}

function enter(scenario: string): void {
  recordedGit.enterScenario(scenario, { repositoryDirectory, commits: { '<start>': START_COMMIT, '<moved>': MOVED_COMMIT } });
}

/** The start the launch writes: the snapshot's HEAD and every ref, taken on the untouched snapshot. */
function writeSnapshotStart(jobId: string): void {
  enter(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_UNTOUCHED);
  const launchSnapshot = launchSnapshotOf(join(repositoryDirectory, PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME));
  const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, jobId);
  mkdirSync(jobFolder, { recursive: true });
  writeFileSync(join(jobFolder, SNAPSHOT_START_FILE), `${JSON.stringify({ startCommit: START_COMMIT, launchSnapshot })}\n`);
}

function touchedIncidentsOf(board: Board): readonly (readonly [string | null, Readonly<Record<string, string>>])[] {
  return board.incidents().filter((incident) => incident.kind === 'setup-snapshot-touched').map((incident) => [incident.jobId, incident.facts] as const);
}

testWhenGitIsRecorded('an untouched snapshot passes a turn end and opens nothing', () => {
  const { board, jobId } = boardWithSetupAgent();
  writeSnapshotStart(jobId);

  PipelineAgentSessions.verifyTurnEnds(changeOf(board), turnEndContext(), [jobId]);

  expect(board.setupSnapshotIsTouched(SETUP_ID)).toBe(false);
  expect(touchedIncidentsOf(board)).toEqual([]);
});

testWhenGitIsRecorded('a refused turn end marks the snapshot touched and opens one incident, and a resume clears the mark', () => {
  const { board, jobId } = boardWithSetupAgent();
  writeSnapshotStart(jobId);
  enter(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_FILE_CHANGED);

  PipelineAgentSessions.verifyTurnEnds(changeOf(board), turnEndContext(), [jobId]);
  PipelineAgentSessions.verifyTurnEnds(changeOf(board), turnEndContext(), [jobId]);

  expect(board.setupSnapshotIsTouched(SETUP_ID)).toBe(true);
  expect(touchedIncidentsOf(board)).toEqual([[jobId, {
    setupId: SETUP_ID, check: 'V4', reason: 'worktree-dirty', paths: ' M package.json'
  }]]);
  expect(board.logRecordsSoFar().filter((record) => record.kind === 'pipeline-snapshot-touched')).toHaveLength(1);
  board.resumeSetup(SETUP_ID, MOVED_COMMIT, ['package.json'], AT);
  expect(board.setupSnapshotIsTouched(SETUP_ID)).toBe(false);
});

testWhenGitIsRecorded('a branch outside a namespaced tracker\'s own refs passes its turn end, and fails one with bare branch names as before', () => {
  const { board, jobId } = boardWithSetupAgent();
  writeSnapshotStart(jobId);
  enter(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_BRANCH_ADDED);

  PipelineAgentSessions.verifyTurnEnds(changeOf(board), turnEndContext('example'), [jobId]);
  expect(touchedIncidentsOf(board)).toEqual([]);
  PipelineAgentSessions.verifyTurnEnds(changeOf(board), turnEndContext(), [jobId]);
  expect(touchedIncidentsOf(board)).toEqual([[jobId, {
    setupId: SETUP_ID, check: 'V14', reason: 'foreign-ref-moved', paths: 'refs/heads/pipeline-agent-moved'
  }]]);
});

function headResolvedAs(commit: string): RecordedGitStep {
  return {
    gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}'],
    answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
    filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: commit },
  };
}

function snapshotStartWritten(jobId: string): unknown {
  return JSON.parse(readFileSync(join(WatcherFleet.jobFolderOf(trackerDirectory, jobId), SNAPSHOT_START_FILE), 'utf8')) as unknown;
}

testWhenGitIsRecorded('a launch adds the record\'s snapshot, detached at its snapshot commit, and takes the snapshot start', async () => {
  const { board, jobId } = boardWithSetupAgent();
  const job = board.jobById(jobId);
  if (job === undefined) throw new Error('the agent is on the board');
  const snapshot = join(repositoryDirectory, PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME);
  removeScratchDirectory(snapshot);
  enter(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_UNTOUCHED);
  const added: RecordedGitStep = {
    gitArguments: ['worktree', 'add', '--quiet', '--detach', snapshot, START_COMMIT],
    answeredAs:   GIT_CALL_SHAPES.WORKTREE_ADD_DETACHED,
    leavesFolder: snapshot,
  };
  const context = { workspace: workspace(), worktreesRoot: repositoryDirectory, mainLine: 'main' };

  const prepared = await recordedGit.playStage([added], async () => PipelineAgentSessions.prepareSnapshot(context, board, job));

  expect(prepared).toBe(snapshot);
  expect(snapshotStartWritten(jobId)).toMatchObject({ startCommit: START_COMMIT });
});

testWhenGitIsRecorded('a launch checks an existing snapshot out at the record\'s snapshot commit when a resume moved it', async () => {
  const { board, jobId } = boardWithSetupAgent();
  board.resumeSetup(SETUP_ID, MOVED_COMMIT, ['package.json'], AT);
  const job = board.jobById(jobId);
  if (job === undefined) throw new Error('the agent is on the board');
  const snapshot = join(repositoryDirectory, PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME);
  enter(GIT_SCENARIOS.PIPELINE_AGENT_SNAPSHOT_UNTOUCHED);
  const resetToTheMovedCommit: RecordedGitStep = { gitArguments: ['reset', '--hard', '--quiet', MOVED_COMMIT], answeredAs: GIT_CALL_SHAPES.HARD_RESET_TO_A_COMMIT };
  const context = { workspace: workspace(), worktreesRoot: repositoryDirectory, mainLine: 'main' };

  await recordedGit.playStage([headResolvedAs(START_COMMIT), resetToTheMovedCommit], async () => PipelineAgentSessions.prepareSnapshot(context, board, job));

  expect(existsSync(snapshot)).toBe(true);
  expect(snapshotStartWritten(jobId)).toHaveProperty('launchSnapshot');
});

test('a turn end with no snapshot start fails closed, and an agent no record names gets the incident alone', () => {
  const { board } = boardFixture();
  const { job } = board.startPipelineAgent(AT);
  board.moveJob(job.id, 'running', AT);

  PipelineAgentSessions.verifyTurnEnds(changeOf(board), turnEndContext(), [job.id]);

  expect(touchedIncidentsOf(board)).toEqual([[job.id, { check: 'V16', reason: 'git-failed', paths: 'no snapshot start' }]]);
  expect(board.logRecordsSoFar().some((record) => record.kind === 'pipeline-snapshot-touched')).toBe(false);
});

test('the record gives its agent the billing, before any pipeline is stored, and the facts of its first message', () => {
  const { board, jobId } = boardWithSetupAgent();
  const job = board.jobById(jobId);
  if (job === undefined) throw new Error('the agent is on the board');
  const installedConstitutionPath = join(repositoryDirectory, CONSTITUTION_DEFAULT_PATH);
  mkdirSync(path.dirname(installedConstitutionPath), { recursive: true });
  writeFileSync(installedConstitutionPath, '# Constitution\n');

  const facts = PipelineAgentSessions.pipelineAgentFactsOf(board, job, 'posix-shell', repositoryDirectory);

  expect(PipelineAgentSessions.launchBillingOf(board, job)).toEqual({ mode: 'api', maxBudgetUsd: 5 });
  expect(facts?.mode).toBe('setup');
  expect(facts?.setup).toEqual(board.pipelineSetup());
  expect(facts?.installedConstitution).toBe('# Constitution\n');
});

test('an agent no record names advises on the stored pipeline, and a missing installed constitution is no fact', () => {
  const { board } = boardFixture();
  board.setNoGates(AT);
  const { job } = board.startPipelineAgent(AT);

  const facts = PipelineAgentSessions.pipelineAgentFactsOf(board, job, 'posix-shell', repositoryDirectory);

  expect(facts?.mode).toBe('advise');
  expect(facts?.setup).toBeNull();
  expect(facts?.storedPipeline).toEqual(board.pipeline());
  expect(facts?.installedConstitution).toBeNull();
});

testWhenGitIsRecorded('a record whose agent has no snapshot commit takes main\'s tip, once', async () => {
  const { board } = boardFixture();
  board.openSetup({
    mode: 'setup', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  }, AT);
  const { job } = board.startPipelineAgent(AT);
  board.attachSetupAgent(SETUP_ID, job.id, null);
  const mainResolved: RecordedGitStep = {
    gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', 'main^{commit}'],
    answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
    filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: START_COMMIT },
  };

  await recordedGit.playStage([mainResolved], async () => PipelineAgentSessions.pinSnapshotCommit(changeOf(board), 'main'));
  await recordedGit.playStage([], async () => PipelineAgentSessions.pinSnapshotCommit(changeOf(board), 'main'));

  expect(board.pipelineSetup()?.snapshotCommit).toBe(START_COMMIT);
});

testWhenGitIsRecorded('a snapshot no open record holds is removed once with no agent running, and one the removal leaves is a leftover', async () => {
  const { board } = boardFixture();
  board.openSetup({
    mode: 'setup', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  }, AT);
  const snapshotsFolder = join(repositoryDirectory, PIPELINE_AGENT_SNAPSHOT_FOLDER);
  const discardedSnapshot = join(snapshotsFolder, 'S0');
  mkdirSync(join(discardedSnapshot, '.git'), { recursive: true });
  const declinedRemoval: RecordedGitStep = {
    gitArguments: ['worktree', 'remove', '--force', discardedSnapshot],
    answeredAs:   GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_LEFTOVER,
    filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: discardedSnapshot },
  };
  const prune: RecordedGitStep = { gitArguments: ['worktree', 'prune'], answeredAs: GIT_CALL_SHAPES.WORKTREE_PRUNE_WITH_NOTHING_STALE };
  const noPause = { ...REAL_WORKTREE_REMOVAL_PRIMITIVES, pause: () => undefined };
  const logged: string[] = [];
  const tried = new Set<string>();
  const context = { workspace: workspace(), worktreesRoot: repositoryDirectory };

  const { job } = board.startPipelineAgent(AT);
  await recordedGit.playStage([], async () => PipelineAgentSessions.removeUnheldSnapshots(board, context, tried, (line) => logged.push(line), noPause));
  board.endJob(job.id, { outcome: 'closed' }, AT);
  const everyTryThenPrune = [...Array.from({ length: WORKTREE_REMOVAL_TRIES }, () => declinedRemoval), prune];
  await recordedGit.playStage(everyTryThenPrune, async () => PipelineAgentSessions.removeUnheldSnapshots(board, context, tried, (line) => logged.push(line), noPause));
  await recordedGit.playStage([], async () => PipelineAgentSessions.removeUnheldSnapshots(board, context, tried, (line) => logged.push(line), noPause));

  expect(logged).toEqual([expect.stringContaining(`The pipeline agent snapshot ${discardedSnapshot} is a leftover: git worktree remove`)]);
  expect(existsSync(join(repositoryDirectory, PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME))).toBe(true);
});
