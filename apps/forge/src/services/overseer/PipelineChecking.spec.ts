/**
 * The Overseer's pipeline checks, on recorded git, a fake line runner and a stand-in for the two runs. What matters: User's queued check
 * runs the draft's prepare steps and only the gates the draft changes or adds, two times, in a fresh detached worktree of main's tip at
 * `<worktrees>/pipeline-checks/<S>`, with no `writes` granted, holding a slot it takes only after the real gates; the result is stored in
 * the record, its output cut to its end, and the record's agent gets it as a message in the same hold, with no `gate-ran` record; a refused
 * line ends the check `cannot-run` with the reason; its lines run in `<data>/pipeline-checks/<S>`, the folder that holds its slot; an
 * Overseer stop sends `stop` to its running line and the check reads `stopped` with no message; and an Overseer start stops the lines an
 * earlier Overseer left, then reads a check left running as `stopped` and removes every check worktree. On a draft over
 * entities, each entity's check runs in its own worktree `<S>-<entity>`, its steps and gates from the entity's first home, and only that
 * entity's session hears the end; that case holds the board in memory, since no stored record holds entities yet.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join }                                from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { PipelineCheck, PipelineSetup }                      from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Board }                                             from '../../lib/tracker-model/Board.ts';
import { CHECK_OUTPUT_LIMIT_CHARACTERS }                          from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import type { ControlCommand }                                    from '../../shared/@types/ControlCommand.ts';
import { WorktreesFolder }                                        from '../../shared/WorktreesFolder.ts';
import { boardFixture, entityPipelineFixture, type BoardFixture } from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                                 from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS }   from '../../testing/FixtureRecordAllocation.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                                from '../../testing/LockTakers.ts';
import { nativePlatformPorts }                                    from '../../testing/NativePlatformPorts.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  useRecordedGit,
  type RecordedGitStage
} from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                          from '../../testing/ToolGuard.ts';
import { writeReadableTracker }                           from '../../testing/TrackerFileFixtures.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { ControlService }                                 from '../control/ControlService.ts';
import type { LineRunEnd, LineRunRequest }                from '../lifecycle/GateRun.ts';
import type { ProposalRunRecord, ProposalRunRequest }     from '../lifecycle/ProposalTwiceRun.ts';
import type { BoardTransaction }                          from '../tracker/BoardTransaction.ts';
import { localStoreLayoutOf }                             from '../tracker/LocalStoreLayout.ts';
import { writeTracker }                                   from '../tracker/TrackerPipeline.ts';
import { workspacePathsFor, type Workspace }              from '../tracker/Workspace.ts';
import {
  PIPELINE_CHECK_RUNS_FOLDER,
  PIPELINE_CHECK_WORKTREES_FOLDER,
  PipelineChecking,
  type PipelineCheckingContext
} from './PipelineChecking.ts';

const CHANGED_AT = '2026-11-12T10:00:00+01:00';
const MAIN_LINE = 'main';
const MAIN_TIP = 'c'.repeat(40);

const recordedGit = useRecordedGit();

let repository = '';
let workspace: Workspace;
let runRequests: ProposalRunRequest[];
/** Each line a run handed the line runner; its stop signal aborted is the runner's `stop`. */
let runnerRequests: LineRunRequest[];
/** Each folder the leftover lines were stopped under, and whether the check worktrees still existed then. */
let leftoverLineStops: { folder: string; worktreesThen: boolean }[];
let slotsFree: boolean;
let heldSlots: string[];

const now = (): Date => new Date('2026-11-12T09:00:00Z');

beforeEach(() => {
  repository = createScratchDirectory('pipeline-checking');
  workspace = workspacePathsFor(repository);
  writeReadableTracker(workspace);
  runRequests = [];
  runnerRequests = [];
  leftoverLineStops = [];
  slotsFree = true;
  heldSlots = [];
});

afterEach(() => {
  removeScratchDirectory(repository);
});

function changeOfFixture(fixture: BoardFixture): BoardTransaction {
  return {
    board:                          fixture.board,
    workspace,
    at:                             CHANGED_AT,
    records:                        createFixtureRecordAllocation(fixture.board),
    unreadableRecords:              NO_UNREADABLE_RECORDS,
    unreadablePipeline:             null,
    storedLogEntryCount:            0,
    storedLogRecords:               [],
    deleteAllTicketFilesAfterwards: () => undefined,
  };
}

async function applied(command: ControlCommand): Promise<void> {
  await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace,
    at:        CHANGED_AT,
    now,
    mutate:    (change) => ControlService.apply(command, change, ECHOED_CONTROL_CONTEXT)
  });
}

/** The board as stored, read in a hold that changes nothing. */
async function storedBoard(): Promise<Board> {
  return (await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace,
    at:        CHANGED_AT,
    now,
    mutate:    () => undefined
  })).board;
}

async function storedCheck(): Promise<PipelineCheck | undefined> {
  return (await storedBoard()).pipelineSetup()?.check;
}

function worktreeOf(setupId: string): string {
  return join(WorktreesFolder.worktreesRootOf(repository), PIPELINE_CHECK_WORKTREES_FOLDER, setupId);
}

function worktreeRemoveOf(setupId: string): RecordedGitStage[number] {
  const worktree = worktreeOf(setupId);
  return { gitArguments: ['worktree', 'remove', '--force', worktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_LINKED, removesFolder: worktree };
}

/** Main's tip resolved, a detached worktree of it added, and the worktree removed once the check ended. */
function worktreeOfMainTipAddedAndRemoved(setupId: string): RecordedGitStage {
  const worktree = worktreeOf(setupId);
  return [
    {
      gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${MAIN_LINE}^{commit}`],
      answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
      filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: MAIN_TIP },
    },
    { gitArguments: ['worktree', 'add', '--quiet', '--detach', worktree, MAIN_TIP], answeredAs: GIT_CALL_SHAPES.WORKTREE_ADD_DETACHED, leavesFolder: worktree },
    worktreeRemoveOf(setupId),
  ];
}

function recordOf(request: ProposalRunRequest, output: string): ProposalRunRecord {
  return {
    snapshotCommit: request.snapshotCommit,
    prepare:        { failedSteps: [null, null], output: '' },
    gates:          request.gates.map((gate) => ({
      name: gate.name, outcomes: ['failed', 'passed'], durationsMilliseconds: [1200.4, 980.6], verdict: 'disagreeing', output
    })),
  };
}

function checkingWith(
  runProposalTwice: PipelineCheckingContext['runProposalTwice'],
  hold: PipelineCheckingContext['hold'] = async (mutate) => (await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace,
    at:        CHANGED_AT,
    now,
    mutate:    (change) => mutate({ board: change.board, at: change.at })
  })).result,
): ReturnType<typeof PipelineChecking.createPipelineChecking> {
  const native = nativePlatformPorts();
  return PipelineChecking.createPipelineChecking({
    workspace,
    worktreesRoot: WorktreesFolder.worktreesRootOf(repository),
    mainLine:      MAIN_LINE,
    platformPorts: { shellLine: native.shellLine },
    gateSlots:     {
      tryAcquireAfterRealGates: (holder) => {
        if (slotsFree) heldSlots.push(holder);
        return slotsFree;
      },
      release: (holder) => { heldSlots = heldSlots.filter((held) => held !== holder); },
    },
    gateEnvironment:       () => ({}),
    confinedLineIn:        () => (argv) => ({ verdict: 'runs', argv }),
    hold,
    wake:                  () => undefined,
    log:                   () => undefined,
    setupMessageWordingOf: (message) => JSON.stringify(message),
    runProposalTwice:      (request) => {
      runRequests.push(request);
      return runProposalTwice(request);
    },
    runLine:            heldLineOf,
    stopLiveLinesUnder: (folder) => {
      leftoverLineStops.push({ folder, worktreesThen: existsSync(join(WorktreesFolder.worktreesRootOf(repository), PIPELINE_CHECK_WORKTREES_FOLDER)) });
      return Promise.resolve();
    },
  });
}

/** A line the fake runner holds until the check's stop aborts its signal, which ends it as a stopped line. */
function heldLineOf(request: LineRunRequest): Promise<LineRunEnd> {
  runnerRequests.push(request);
  return new Promise((resolve) => {
    request.stopSignal?.addEventListener('abort', () => resolve({
      exitCode: null, signalCode: 'SIGKILL', endReason: 'signalled', output: '', runMilliseconds: 10
    }), { once: true });
  });
}

/** An update of the stored `tests` and `types` gates whose draft changes `tests` and adds `lint`, `types` as stored; its agent is J1. */
async function checkRequestedOnAnUpdate(): Promise<void> {
  await applied({ kind: 'pipeline-prepare-step-set', step: { name: 'install', run: 'bun install --frozen-lockfile' } });
  await applied({ kind: 'pipeline-gate-add', gate: { name: 'tests', run: 'bun test', writes: ['/example-cache'] } });
  await applied({ kind: 'pipeline-gate-add', gate: { name: 'types', run: 'tsc' } });
  await applied({ kind: 'pipeline-agent-advise' });
  await applied({
    kind:          'pipeline-draft-edit',
    setupId:       'S1',
    draftRevision: 0,
    edits:         [
      { target: 'gate', name: 'tests', value: { name: 'tests', run: 'bun test --bail', writes: ['/example-cache'] } },
      { target: 'gate', name: 'lint', value: { name: 'lint', run: 'eslint .' } },
      { target: 'phase-order', phase: 'merge', names: ['tests', 'types', 'lint'] },
    ],
  });
  await applied({ kind: 'pipeline-check', setupId: 'S1' });
}

function messagesTo(jobId: string): unknown[] {
  return readFileSync(localStoreLayoutOf(workspace).logRecordPath, 'utf8').split('\n').filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { kind: string; jobId?: string; fields: { text?: string } })
    .filter((record) => record.kind === 'job-messaged' && record.jobId === jobId)
    .map((record) => JSON.parse(record.fields.text ?? '') as unknown);
}

testWhenGitIsRecorded('runs only the touched gates two times in a fresh worktree of main, stores the result and messages the agent with it', async () => {
  await checkRequestedOnAnUpdate();
  const longOutput = `${'x'.repeat(CHECK_OUTPUT_LIMIT_CHARACTERS)}the end of the output\n`;
  const checking = checkingWith(async (request) => {
    expect(existsSync(request.directory)).toBe(true);
    return recordOf(request, longOutput);
  });

  await recordedGit.playStage(worktreeOfMainTipAddedAndRemoved('S1'), async () => {
    checking.followChecks(await storedBoard());
    await checking.idle();
  });

  expect(runRequests).toHaveLength(1);
  expect(runRequests[0]).toMatchObject({
    directory:      worktreeOf('S1'),
    snapshotCommit: MAIN_TIP,
    grantsWrites:   false,
    prepare:        [{ name: 'install', run: 'bun install --frozen-lockfile' }],
    gates:          [{ name: 'tests', run: 'bun test --bail' }, { name: 'lint', run: 'eslint .' }],
  });
  const check = await storedCheck();
  expect(check).toMatchObject({
    draftRevision: 1, gateNames: ['tests', 'lint'], state: 'checked', reason: null
  });
  expect(check?.result?.snapshotCommit).toBe(MAIN_TIP);
  expect(check?.result?.gates.map((gate) => [gate.name, gate.verdict, gate.durationsMilliseconds])).toEqual([
    ['tests', 'disagreeing', [1200, 981]], ['lint', 'disagreeing', [1200, 981]],
  ]);
  expect(check?.result?.gates[0]?.output).toHaveLength(CHECK_OUTPUT_LIMIT_CHARACTERS);
  expect(check?.result?.gates[0]?.output.endsWith('the end of the output\n')).toBe(true);
  expect(messagesTo('J1').at(-1)).toEqual({ kind: 'check-ended', setupId: 'S1', check });
  expect(readFileSync(localStoreLayoutOf(workspace).logRecordPath, 'utf8')).not.toContain('"kind":"gate-ran"');
  expect(existsSync(worktreeOf('S1'))).toBe(false);
  expect(heldSlots).toEqual([]);
});

test('waits queued while no slot is free after the real gates, and starts nothing', async () => {
  await checkRequestedOnAnUpdate();
  slotsFree = false;
  const checking = checkingWith((request) => Promise.resolve(recordOf(request, '')));

  checking.followChecks(await storedBoard());
  await checking.idle();

  expect(runRequests).toEqual([]);
  expect((await storedCheck())?.state).toBe('queued');
});

testWhenGitIsRecorded('a line the confinement refused ends the check cannot-run with the reason, and the agent hears it', async () => {
  await checkRequestedOnAnUpdate();
  const checking = checkingWith(() => Promise.resolve({ verdict: 'sandbox-unavailable', reason: 'example sandbox tool missing' }));

  await recordedGit.playStage(worktreeOfMainTipAddedAndRemoved('S1'), async () => {
    checking.followChecks(await storedBoard());
    await checking.idle();
  });

  const check = await storedCheck();
  expect(check).toMatchObject({ state: 'cannot-run', result: null, reason: 'example sandbox tool missing' });
  expect(messagesTo('J1').at(-1)).toEqual({ kind: 'check-ended', setupId: 'S1', check });
});

test('a draft that no longer touches a gate when the run starts ends cannot-run, and asks git nothing', async () => {
  await checkRequestedOnAnUpdate();
  await applied({ kind: 'pipeline-draft-discard', setupId: 'S1' });
  const checking = checkingWith((request) => Promise.resolve(recordOf(request, '')));

  await recordedGit.playStage([], async () => {
    checking.followChecks(await storedBoard());
    await checking.idle();
  });

  expect(runRequests).toEqual([]);
  expect(await storedCheck()).toMatchObject({ state: 'cannot-run', gateNames: [], reason: 'no-touched-gate' });
});

testWhenGitIsRecorded('an Overseer stop sends stop to the running check\'s line, and the check reads stopped with no message', async () => {
  await checkRequestedOnAnUpdate();
  const checking = checkingWith(async (request) => {
    await request.runLine({
      childFolder:           join(request.childFolder, 'run-1', 'gate-1'),
      argv:                  ['/example/gate'],
      verbatimArguments:     false,
      directory:             request.directory,
      environment:           {},
      label:                 'run-1/gate-1',
      timeBoundMilliseconds: null,
    });
    return recordOf(request, '');
  });
  const messagesBefore = messagesTo('J1').length;

  await recordedGit.playStage(worktreeOfMainTipAddedAndRemoved('S1'), async () => {
    checking.followChecks(await storedBoard());
    await waitUntil(() => runnerRequests.length > 0, 'the check never started');
    expect(runRequests[0]?.childFolder).toBe(join(workspace.trackerDirectory, PIPELINE_CHECK_RUNS_FOLDER, 'S1'));
    expect(heldSlots).toEqual([join(workspace.trackerDirectory, PIPELINE_CHECK_RUNS_FOLDER, 'S1')]);
    const stopped = checking.stopAll();
    expect(runnerRequests.map((request) => request.stopSignal?.aborted)).toEqual([true]);
    await stopped;
  });

  expect(await storedCheck()).toMatchObject({ state: 'stopped', result: null });
  expect(messagesTo('J1')).toHaveLength(messagesBefore);
});

testWhenGitIsRecorded('an Overseer start stops the lines left running, then reads a check left running as stopped and removes every check worktree', async () => {
  await checkRequestedOnAnUpdate();
  await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace,
    at:        CHANGED_AT,
    now,
    mutate:    (change) => change.board.startPipelineCheck('S1')
  });
  mkdirSync(worktreeOf('S1'), { recursive: true });
  const checking = checkingWith((request) => Promise.resolve(recordOf(request, '')));

  await recordedGit.playStage([worktreeRemoveOf('S1')], async () => {
    await checking.settleAtStart();
    checking.followChecks(await storedBoard());
    await checking.idle();
  });

  expect(await storedCheck()).toMatchObject({ state: 'stopped', result: null });
  expect(runRequests).toEqual([]);
  expect(leftoverLineStops).toEqual([{ folder: join(workspace.trackerDirectory, PIPELINE_CHECK_RUNS_FOLDER), worktreesThen: true }]);
  expect(existsSync(worktreeOf('S1'))).toBe(false);
});

testWhenGitIsRecorded('an entity\'s check runs from its first home in a worktree of its own, and only that entity\'s session hears the end', async () => {
  const pipeline = entityPipelineFixture();
  const fixture = boardFixture({ pipeline });
  ControlService.apply({ kind: 'pipeline-agent-advise' }, changeOfFixture(fixture), ECHOED_CONTROL_CONTEXT);
  const setup = fixture.board.pipelineSetup() as PipelineSetup | null;
  if (setup === null) throw new Error('the advise opened no record');
  setup.draft = structuredClone(pipeline);
  const draftWeb = setup.draft.entities?.['web'];
  if (draftWeb === undefined) throw new Error('the draft has no web entity');
  draftWeb.prepare = [{ name: 'install', run: 'bun install', in: 'tools' }];
  draftWeb.gates = [{ name: 'test', run: 'bun test' }];
  draftWeb.phases.build = ['test'];
  fixture.board.startPipelineAgent(CHANGED_AT, 'web');
  fixture.board.attachSetupAgent('S1', 'J2', null, 'web');
  fixture.board.requestPipelineCheck('S1', CHANGED_AT);
  fixture.records.length = 0;
  const checking = checkingWith((request) => Promise.resolve(recordOf(request, '')), (mutate) => Promise.resolve(mutate({ board: fixture.board, at: CHANGED_AT })));

  await recordedGit.playStage(worktreeOfMainTipAddedAndRemoved('S1-web'), async () => {
    checking.followChecks(fixture.board);
    await checking.idle();
  });

  expect(runRequests).toHaveLength(1);
  expect(runRequests[0]).toMatchObject({
    directory: worktreeOf('S1-web'),
    prepare:   [{ name: 'install', run: 'bun install', in: '/apps/web/tools' }],
    gates:     [{ name: 'test', run: 'bun test', in: '/apps/web' }],
  });
  const check = fixture.board.pipelineSetup()?.entities?.['web']?.check;
  expect(check).toMatchObject({ gateNames: ['test'], state: 'checked' });
  expect(fixture.board.pipelineSetup()?.check).toBeUndefined();
  expect(fixture.records.filter((record) => record.kind === 'job-messaged').map((record) => [record.jobId, JSON.parse(String((record.fields as { text: string }).text))])).toEqual([
    ['J2', { kind: 'check-ended', setupId: 'S1', check }],
  ]);
});
