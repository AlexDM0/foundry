/**
 * The pipeline agent as a session, on Hephaestus's side: Customs at each turn end marks the record's snapshot touched and opens one incident
 * on a refusal, an unreadable snapshot start fails closed, a launch checks the record's snapshot out at its commit, and unheld snapshots are
 * removed. Git answers from `src/testing/RecordedGit.ts` and `src/testing/RecordedGitScenarios.ts`, whose snapshot is setup `S1`'s.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path, { join }                           from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { SnapshotStartIngestion }                                   from '../../adapters/snapshot-start/SnapshotStartIngestion.ts';
import { createSnapshotStartWriter }                                from '../../adapters/snapshot-start/SnapshotStartWriter.ts';
import type { Board }                                               from '../../domain/tracker-model/Board.ts';
import { REAL_WORKTREE_REMOVAL_PRIMITIVES, WORKTREE_REMOVAL_TRIES } from '../../lib/git/GitWorktrees.ts';
import { branchNamesOf }                                            from '../../shared/BranchNames.ts';
import { PRODUCT_NAMES }                                            from '../../shared/constants/ProductNames.ts';
import { boardFixture }                                             from '../../testing/BoardFixtures.ts';
import { EVERY_BILLING_MODE_OFFERED, EXAMPLE_PIPELINE_AGENT }       from '../../testing/ExamplePipelineAgent.ts';
import { fakeAgentAdapter }                                         from '../../testing/FakeAgentAdapter.ts';
import { detailsLoggerOf }                                          from '../../testing/LoggedDetails.ts';
import type { RecordedGitStep }                                     from '../../testing/RecordedGit.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit }   from '../../testing/RecordedGit.ts';
import { PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME }                      from '../../testing/RecordedGitScenarioCalls.ts';
import { GIT_SCENARIOS }                                            from '../../testing/RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory }           from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                    from '../../testing/ToolGuard.ts';
import { launchSnapshotOf }                                         from '../lifecycle/CustomsLaunchSnapshot.ts';
import type { BoardTransaction }                                    from '../tracker/BoardTransaction.ts';
import type { Workspace }                                           from '../tracker/Workspace.ts';
import { jobFolderIn }                                              from './HephaestusFiles.ts';
import { CONSTITUTION_DEFAULT_PATH }                                from './InstructionFiles.ts';
import { PIPELINE_AGENT_SNAPSHOT_FOLDER, PipelineAgentSessions }    from './PipelineAgentSessions.ts';

const AT = '2026-10-31T12:00:00+01:00';
const SNAPSHOT_START_FILE = 'pipeline-agent-start.json';
const START_COMMIT = '1'.repeat(40);
const MOVED_COMMIT = '2'.repeat(40);
const SETUP_ID = 'S1';

function factsLaunch(): Parameters<typeof PipelineAgentSessions.pipelineAgentFactsOf>[2] {
  return { lineGrammar: 'posix-shell', rootDirectory: repositoryDirectory, agentAdapter: fakeAgentAdapter() };
}

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
    agentNaming:   fakeAgentAdapter(),
  };
}

function changeOf(board: Board): BoardTransaction {
  return { board, at: AT, workspace: workspace() } as unknown as BoardTransaction;
}

/** A first setup on API billing whose agent runs, its snapshot at the start commit. */
function boardWithSetupAgent(): { board: Board; jobId: string } {
  const { board } = boardFixture();
  board.openSetup({
    mode:                       'setup',
    billing:                    { mode: 'api', maxBudgetUsd: 5 },
    agent:                      EXAMPLE_PIPELINE_AGENT,
    offeredBillingModesOf:      EVERY_BILLING_MODE_OFFERED,
    replacesUnreadablePipeline: false,
    mainConstitution:           null,
    storedAnnotations:          [],
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
  if (launchSnapshot === null) throw new Error('the recorded snapshot answers its refs');
  createSnapshotStartWriter(join(jobFolderIn(trackerDirectory, jobId), SNAPSHOT_START_FILE)).write({ startCommit: START_COMMIT, launchSnapshot });
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

function snapshotStartWritten(jobId: string): ReturnType<SnapshotStartIngestion['read']> {
  return new SnapshotStartIngestion(join(jobFolderIn(trackerDirectory, jobId), SNAPSHOT_START_FILE)).read();
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
  expect(snapshotStartWritten(jobId)).toMatchObject({ verdict: 'readable', snapshotStart: { startCommit: START_COMMIT } });
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
  expect(snapshotStartWritten(jobId)).toHaveProperty(['snapshotStart', 'launchSnapshot']);
});

test('a turn end with no snapshot start fails closed, and an agent no record names gets the incident alone', () => {
  const { board } = boardFixture();
  const { job } = board.startPipelineAgent(AT);
  board.moveJob(job.id, 'running', AT);

  PipelineAgentSessions.verifyTurnEnds(changeOf(board), turnEndContext(), [job.id]);

  expect(touchedIncidentsOf(board)).toEqual([[job.id, { check: 'V16', reason: 'git-failed', paths: 'no snapshot start' }]]);
  expect(board.logRecordsSoFar().some((record) => record.kind === 'pipeline-snapshot-touched')).toBe(false);
});

function writeVersionlessSnapshotStart(jobId: string): void {
  const jobFolder = jobFolderIn(trackerDirectory, jobId);
  mkdirSync(jobFolder, { recursive: true });
  const startOfBeforeTheVersion = { startCommit: START_COMMIT, launchSnapshot: { refs: {}, hooksFolderDigest: null } };
  writeFileSync(join(jobFolder, SNAPSHOT_START_FILE), `${JSON.stringify(startOfBeforeTheVersion)}\n`);
}

test('a turn end whose snapshot start cannot be read marks the snapshot touched, opens the incident once, retires the agent, no Customs', () => {
  const { board, jobId } = boardWithSetupAgent();
  writeVersionlessSnapshotStart(jobId);

  PipelineAgentSessions.verifyTurnEnds(changeOf(board), turnEndContext(), [jobId]);
  PipelineAgentSessions.verifyTurnEnds(changeOf(board), turnEndContext(), [jobId]);

  expect(board.incidents().map((incident) => [incident.kind, incident.jobId, incident.facts])).toEqual([
    ['system-file-unreadable', jobId, {
      file: `jobs/${jobId}/${SNAPSHOT_START_FILE}`, problem: 'version-differs', field: 'version', expectedVersion: '1'
    }],
  ]);
  expect(board.setupSnapshotIsTouched(SETUP_ID)).toBe(true);
  expect(board.jobById(jobId)?.state).toBe('stopping');
});

test('a stopping agent whose snapshot start cannot be read still marks the snapshot touched, and opens no incident', () => {
  const { board, jobId } = boardWithSetupAgent();
  writeVersionlessSnapshotStart(jobId);
  board.moveJob(jobId, 'stopping', AT);

  PipelineAgentSessions.verifyTurnEnds(changeOf(board), turnEndContext(), [jobId]);

  expect(board.incidents()).toEqual([]);
  expect(board.setupSnapshotIsTouched(SETUP_ID)).toBe(true);
});

test('the record gives its agent the billing, before any pipeline is stored, and the facts of its first message', () => {
  const { board, jobId } = boardWithSetupAgent();
  const job = board.jobById(jobId);
  if (job === undefined) throw new Error('the agent is on the board');
  const installedConstitutionPath = join(repositoryDirectory, CONSTITUTION_DEFAULT_PATH);
  mkdirSync(path.dirname(installedConstitutionPath), { recursive: true });
  writeFileSync(installedConstitutionPath, '# Constitution\n');

  const facts = PipelineAgentSessions.pipelineAgentFactsOf(board, job, factsLaunch());

  expect(PipelineAgentSessions.launchBillingOf(board, job)).toEqual({ verdict: 'chosen', billing: { mode: 'api', maxBudgetUsd: 5 } });
  expect(facts?.mode).toBe('setup');
  expect(facts?.setup).toEqual(board.pipelineSetup());
  expect(facts?.installedConstitution).toBe('# Constitution\n');
  expect(facts?.firstLine).toBe(fakeAgentAdapter().instructionBundleLineOf(PRODUCT_NAMES.PIPELINE_SETUP_SKILL, ''));
});

test('a first setup\'s agent whose record holds no billing launches under none, never the vendor\'s default, until one is chosen', () => {
  const { board } = boardFixture();
  board.openSetup({
    mode:                       'setup',
    billing:                    null,
    agent:                      EXAMPLE_PIPELINE_AGENT,
    offeredBillingModesOf:      EVERY_BILLING_MODE_OFFERED,
    replacesUnreadablePipeline: false,
    mainConstitution:           null,
    storedAnnotations:          [],
  }, AT);
  const { job } = board.startPipelineAgent(AT);
  board.attachSetupAgent(SETUP_ID, job.id, null);

  expect(PipelineAgentSessions.launchBillingOf(board, job)).toEqual({ verdict: 'not-chosen' });
  board.setSetupBilling(SETUP_ID, { mode: 'subscription' }, EVERY_BILLING_MODE_OFFERED, AT);
  expect(PipelineAgentSessions.launchBillingOf(board, job)).toEqual({ verdict: 'chosen', billing: { mode: 'subscription' } });
});

test('an update\'s agent over a pipeline that stores no billing launches under the stored pipeline\'s none', () => {
  const { board } = boardFixture();
  board.setNoGates(AT);
  board.openSetup({
    mode:                       'update',
    billing:                    null,
    agent:                      null,
    replacesUnreadablePipeline: false,
    mainConstitution:           null,
    storedAnnotations:          [],
  }, AT);
  const { job } = board.startPipelineAgent(AT);
  board.attachSetupAgent(SETUP_ID, job.id, null);

  expect(PipelineAgentSessions.launchBillingOf(board, job)).toEqual({ verdict: 'chosen', billing: undefined });
});

test('an agent no record names advises on the stored pipeline, and a missing installed constitution is no fact', () => {
  const { board } = boardFixture();
  board.setNoGates(AT);
  const { job } = board.startPipelineAgent(AT);

  const facts = PipelineAgentSessions.pipelineAgentFactsOf(board, job, factsLaunch());

  expect(facts?.mode).toBe('advise');
  expect(facts?.setup).toBeNull();
  expect(facts?.storedPipeline).toEqual(board.pipeline());
  expect(facts?.installedConstitution).toBeNull();
});

testWhenGitIsRecorded('a record whose agent has no snapshot commit takes main\'s tip, once', async () => {
  const { board } = boardFixture();
  board.openSetup({
    mode:                       'setup',
    billing:                    { mode: 'subscription' },
    agent:                      EXAMPLE_PIPELINE_AGENT,
    offeredBillingModesOf:      EVERY_BILLING_MODE_OFFERED,
    replacesUnreadablePipeline: false,
    mainConstitution:           null,
    storedAnnotations:          [],
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

test('an entity\'s session serves its entity\'s part of the record, from the record\'s snapshot and billing, and its facts name the entity', () => {
  const { board, jobId } = boardWithSetupAgent();
  const { job } = board.startPipelineAgent(AT, 'web');
  board.attachSetupAgent(SETUP_ID, job.id, null, 'web');

  expect(PipelineAgentSessions.servedLevelOf(board, jobId)).toMatchObject({ entityKey: null });
  expect(PipelineAgentSessions.servedLevelOf(board, job.id)).toMatchObject({ entityKey: 'web' });
  expect(PipelineAgentSessions.servedLevelOf(board, 'J99')).toBeNull();
  expect(PipelineAgentSessions.launchBillingOf(board, job)).toEqual({ verdict: 'chosen', billing: { mode: 'api', maxBudgetUsd: 5 } });
  expect(PipelineAgentSessions.pipelineAgentFactsOf(board, job, factsLaunch())).toMatchObject({ mode: 'setup', entity: 'web' });
  expect(PipelineAgentSessions.pipelineAgentFactsOf(board, { ...job, id: jobId }, factsLaunch())?.entity).toBeNull();
});

testWhenGitIsRecorded('a record whose sessions are only at entities takes main\'s tip, once', async () => {
  const { board } = boardFixture();
  board.openSetup({
    mode:                       'setup',
    billing:                    { mode: 'subscription' },
    agent:                      EXAMPLE_PIPELINE_AGENT,
    offeredBillingModesOf:      EVERY_BILLING_MODE_OFFERED,
    replacesUnreadablePipeline: false,
    mainConstitution:           null,
    storedAnnotations:          [],
  }, AT);
  const { job } = board.startPipelineAgent(AT, 'web');
  board.attachSetupAgent(SETUP_ID, job.id, null, 'web');
  const mainResolved: RecordedGitStep = {
    gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', 'main^{commit}'],
    answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
    filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: START_COMMIT },
  };

  await recordedGit.playStage([mainResolved], async () => PipelineAgentSessions.pinSnapshotCommit(changeOf(board), 'main'));

  expect(board.pipelineSetup()?.snapshotCommit).toBe(START_COMMIT);
  expect(board.pipelineSetup()?.agentJobId).toBeNull();
  expect(board.pipelineSetup()?.entities?.['web']?.agentJobId).toBe(job.id);
});

testWhenGitIsRecorded('a snapshot no open record holds is removed once with no agent running, and one the removal leaves is a leftover', async () => {
  const { board } = boardFixture();
  board.openSetup({
    mode:                       'setup',
    billing:                    { mode: 'subscription' },
    agent:                      EXAMPLE_PIPELINE_AGENT,
    offeredBillingModesOf:      EVERY_BILLING_MODE_OFFERED,
    replacesUnreadablePipeline: false,
    mainConstitution:           null,
    storedAnnotations:          [],
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
  await recordedGit.playStage([], async () => PipelineAgentSessions.removeUnheldSnapshots(board, context, tried, detailsLoggerOf(logged), noPause));
  board.endJob(job.id, { outcome: 'closed' }, AT);
  const everyTryThenPrune = [...Array.from({ length: WORKTREE_REMOVAL_TRIES }, () => declinedRemoval), prune];
  await recordedGit.playStage(everyTryThenPrune, async () => PipelineAgentSessions.removeUnheldSnapshots(board, context, tried, detailsLoggerOf(logged), noPause));
  await recordedGit.playStage([], async () => PipelineAgentSessions.removeUnheldSnapshots(board, context, tried, detailsLoggerOf(logged), noPause));

  expect(logged).toEqual([expect.stringContaining(`The pipeline agent snapshot ${discardedSnapshot} is a leftover: git worktree remove`)]);
  expect(existsSync(join(repositoryDirectory, PIPELINE_AGENT_SNAPSHOT_FOLDER_NAME))).toBe(true);
});
