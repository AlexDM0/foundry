/**
 * The Overseer's gate profiles, on recorded git, a fake line runner and a stand-in for the gate lines. What matters: a queued run runs
 * once, one gate in one phase, in a fresh detached worktree of main at `<worktrees>/gate-profiles/<P>`, with the prepare steps and no
 * `writes` granted, its lines in `<data>/gate-profile-runs/<P>`, holding a slot by that folder that it takes only after the real gates; its
 * output lines are appended as Talos records them; it ends with its line's run time, recorded as its gate's `pipeline-step-ran` but never
 * a green or a `gate-ran` record, and its worktree
 * and slot go; a gate Talos stopped at its bound ends the profile `timed-out`; a Stop, and an Overseer stop, send `stop` to its running
 * line and record `stopped` with no duration; the next start stops the lines an earlier Overseer left before it removes their worktrees; a
 * proposal, a draft edit and a start queue no run; a run of the open setup turns the caching checks into note findings; and a run of an
 * entity's gate runs its lines in the folders the press took from the entity's first home. Two entities that share a gate name each get
 * their own note, in their own part of the record, never one in the forge's part.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join }                                from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { PipelineStepRun }                           from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline, PipelineEntity }                  from '../../lib/tracker-model/@types/Pipeline.ts';
import type { ResearchFinding }                           from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Board }                                     from '../../lib/tracker-model/Board.ts';
import type { ControlCommand }                            from '../../shared/@types/ControlCommand.ts';
import { WorktreesFolder }                                from '../../shared/WorktreesFolder.ts';
import { boardFixture }                                   from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                         from '../../testing/EchoedControlContext.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                          from '../../testing/ToolGuard.ts';
import { writeReadableTracker }                           from '../../testing/TrackerFileFixtures.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { ControlService }                                 from '../control/ControlService.ts';
import { SLOW_GATE_MILLISECONDS }                         from '../lifecycle/CachingChecks.ts';
import type { GateLineRunRequest, GateLinesRun }          from '../lifecycle/GateLineRun.ts';
import type { LineRunEnd, LineRunRequest }                from '../lifecycle/GateRun.ts';
import { writeTracker }                                   from '../tracker/TrackerPipeline.ts';
import { workspacePathsFor, type Workspace }              from '../tracker/Workspace.ts';
import {
  GATE_PROFILE_RUNS_FOLDER,
  GATE_PROFILE_WORKTREES_FOLDER,
  GateProfiling,
  type GateProfilingContext
} from './GateProfiling.ts';

const CHANGED_AT = '2026-11-12T10:00:00+01:00';
const MAIN_LINE = 'main';
const PROFILED_MILLISECONDS = 4200;

const recordedGit = useRecordedGit();

let repository = '';
let workspace: Workspace;
let lineRequests: GateLineRunRequest[];
/** Each line the run handed the line runner, and whether its stop signal was aborted, as the runner sends `stop` then. */
let runnerRequests: LineRunRequest[];
/** Each folder the leftover lines were stopped under, and whether the profile worktrees still existed then. */
let leftoverLineStops: { folder: string; worktreesThen: boolean }[];
let slotsFree: boolean;
let heldSlots: string[];

const now = (): Date => new Date('2026-11-12T09:00:00Z');

beforeEach(() => {
  repository = createScratchDirectory('gate-profiling');
  workspace = workspacePathsFor(repository);
  writeReadableTracker(workspace);
  lineRequests = [];
  runnerRequests = [];
  leftoverLineStops = [];
  slotsFree = true;
  heldSlots = [];
});

afterEach(() => {
  removeScratchDirectory(repository);
});

async function applied(command: ControlCommand): Promise<void> {
  await writeTracker({
    workspace, at: CHANGED_AT, now, mutate: (change) => ControlService.apply(command, change, ECHOED_CONTROL_CONTEXT)
  });
}

/** The board as stored, read in a hold that changes nothing. */
async function storedBoard(): Promise<Board> {
  return (await writeTracker({
    workspace, at: CHANGED_AT, now, mutate: () => undefined
  })).board;
}

function worktreeOf(profileRunId: string): string {
  return join(WorktreesFolder.worktreesRootOf(repository), GATE_PROFILE_WORKTREES_FOLDER, profileRunId);
}

function worktreeAddAndRemoveOf(profileRunId: string): Parameters<typeof recordedGit.playStage>[0] {
  const worktree = worktreeOf(profileRunId);
  return [
    { gitArguments: ['worktree', 'add', '--quiet', '--detach', worktree, MAIN_LINE], answeredAs: GIT_CALL_SHAPES.WORKTREE_ADD_DETACHED, leavesFolder: worktree },
    { gitArguments: ['worktree', 'remove', '--force', worktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_LINKED, removesFolder: worktree },
  ];
}

/** The profiled gate's line as `GateLineRun` answers it once the line ran. */
function stepRunOf(runMilliseconds: number, ending: PipelineStepRun['ending']): PipelineStepRun {
  return {
    stepKind: 'gate', stepName: 'tests', runMilliseconds, ending
  };
}

/** The `pipeline-step-ran` records the log holds, as stored. */
function loggedStepRuns(): unknown[] {
  return readFileSync(workspace.logFilePath, 'utf8').split('\n').filter((line) => line.includes('"kind":"pipeline-step-ran"'))
    .map((line) => (JSON.parse(line) as { fields: unknown }).fields);
}

function passedRun(milliseconds = PROFILED_MILLISECONDS): GateLinesRun {
  return {
    failedStep:    null,
    prepareOutput: '',
    gates:         [{
      outcome: 'passed', milliseconds, stoppedAtTimeBound: false, cacheReport: null, output: '', stepRun: stepRunOf(milliseconds, 'passed')
    }]
  };
}

/** A line the fake runner holds until the run's stop aborts its signal, which ends it as a stopped line. */
function heldLineOf(request: LineRunRequest): Promise<LineRunEnd> {
  runnerRequests.push(request);
  return new Promise((resolve) => {
    request.stopSignal?.addEventListener('abort', () => resolve({
      exitCode: null, signalCode: 'SIGKILL', endReason: 'signalled', output: '', runMilliseconds: 10
    }), { once: true });
  });
}

/** Runs one gate line through the run's own line runner and judges it as `GateLineRun` would, so a stop reaches it. */
async function stoppableRun(request: GateLineRunRequest): Promise<GateLinesRun> {
  const end = await request.runLine({
    childFolder:           join(request.childFolder, 'gate-1'),
    argv:                  ['/example/gate'],
    verbatimArguments:     false,
    directory:             request.directory,
    environment:           {},
    label:                 'P1/gate-1',
    timeBoundMilliseconds: null,
  });
  return {
    failedStep:    null,
    prepareOutput: '',
    gates:         [{
      outcome: 'cannot-run', milliseconds: end.runMilliseconds, stoppedAtTimeBound: false, cacheReport: null, output: end.output, stepRun: stepRunOf(end.runMilliseconds, 'failed')
    }]
  };
}

const storedHold: GateProfilingContext['hold'] = async (mutate) => (await writeTracker({
  workspace, at: CHANGED_AT, now, mutate: (change) => mutate({ board: change.board, at: change.at })
})).result;

function profilingWith(
  runGateLines: GateProfilingContext['runGateLines'],
  hold: GateProfilingContext['hold'] = storedHold
): ReturnType<typeof GateProfiling.createGateProfiling> {
  const native = nativePlatformPorts();
  return GateProfiling.createGateProfiling({
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
    gateEnvironment: () => ({}),
    confinedLineIn:  () => (argv) => ({ verdict: 'runs', argv }),
    hold,
    wake:            () => undefined,
    log:             () => undefined,
    runGateLines:    (request) => {
      lineRequests.push(request);
      return runGateLines(request);
    },
    runLine:            heldLineOf,
    stopLiveLinesUnder: (folder) => {
      leftoverLineStops.push({ folder, worktreesThen: existsSync(join(WorktreesFolder.worktreesRootOf(repository), GATE_PROFILE_WORKTREES_FOLDER)) });
      return Promise.resolve();
    },
  });
}

async function storeAPipeline(): Promise<void> {
  await applied({ kind: 'pipeline-prepare-step-set', step: { name: 'install', run: 'bun install --frozen-lockfile' } });
  await applied({
    kind: 'pipeline-gate-add',
    gate: {
      name: 'tests', run: 'bun test', writes: ['/example-cache'], network: ['registry.npmjs.org']
    }
  });
}

describe('a queued run', () => {
  testWhenGitIsRecorded('runs once in a fresh worktree of main, writes not granted, and ends with its time, never a green or a gate-ran record', async () => {
    await storeAPipeline();
    await applied({
      kind: 'gate-profile-start', setupId: null, gateName: 'tests', phase: 'merge'
    });
    const profiling = profilingWith(async (request) => {
      request.onOutputLine?.('example output');
      expect(existsSync(request.directory)).toBe(true);
      return passedRun();
    });

    await recordedGit.playStage(worktreeAddAndRemoveOf('P1'), async () => {
      profiling.followRuns(await storedBoard());
      await profiling.idle();
    });

    expect(lineRequests).toHaveLength(1);
    expect(lineRequests[0]).toMatchObject({
      directory:    worktreeOf('P1'),
      childFolder:  join(workspace.trackerDirectory, GATE_PROFILE_RUNS_FOLDER, 'P1'),
      grantsWrites: false,
      prepare:      [{ name: 'install', run: 'bun install --frozen-lockfile' }],
      gates:        [{ name: 'tests', run: 'bun test', network: ['registry.npmjs.org'] }],
    });
    expect(lineRequests[0]?.gates[0]).not.toHaveProperty('writes');
    expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ profileRunId: 'P1', state: 'passed', elapsedMilliseconds: PROFILED_MILLISECONDS }]);
    const logged = readFileSync(workspace.logFilePath, 'utf8');
    expect(logged).toContain('"kind":"gate-profiled"');
    expect(logged).not.toContain('"kind":"gate-ran"');
    expect(loggedStepRuns()).toEqual([{
      stepKind: 'gate', stepName: 'tests', phase: 'merge', runMilliseconds: PROFILED_MILLISECONDS, ending: 'passed'
    }]);
    expect(readFileSync(join(workspace.trackerDirectory, GATE_PROFILE_RUNS_FOLDER, 'P1.ndjson'), 'utf8')).toBe('{"text":"example output\\n"}\n');
    expect(existsSync(worktreeOf('P1'))).toBe(false);
    expect(heldSlots).toEqual([]);
  });

  testWhenGitIsRecorded('holds its slot by its folder of lines, and a gate Talos stopped at its bound ends it timed out with the line\'s run time', async () => {
    await storeAPipeline();
    await applied({
      kind: 'gate-profile-start', setupId: null, gateName: 'tests', phase: 'build'
    });
    const slotHoldersDuringTheRun: string[][] = [];
    const profiling = profilingWith(() => {
      slotHoldersDuringTheRun.push([...heldSlots]);
      return Promise.resolve({
        failedStep:    null,
        prepareOutput: '',
        gates:         [{
          outcome:            'cannot-run',
          milliseconds:       PROFILED_MILLISECONDS,
          stoppedAtTimeBound: true,
          cacheReport:        null,
          output:             'example output',
          stepRun:            stepRunOf(PROFILED_MILLISECONDS, 'time-bound'),
        }]
      });
    });

    await recordedGit.playStage(worktreeAddAndRemoveOf('P1'), async () => {
      profiling.followRuns(await storedBoard());
      await profiling.idle();
    });

    expect(slotHoldersDuringTheRun).toEqual([[join(workspace.trackerDirectory, GATE_PROFILE_RUNS_FOLDER, 'P1')]]);
    expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ state: 'timed-out', elapsedMilliseconds: PROFILED_MILLISECONDS }]);
    expect(loggedStepRuns()).toMatchObject([{ stepName: 'tests', runMilliseconds: PROFILED_MILLISECONDS, ending: 'time-bound' }]);
  });

  test('waits queued while no slot is free after the real gates, and starts nothing', async () => {
    await storeAPipeline();
    await applied({
      kind: 'gate-profile-start', setupId: null, gateName: 'tests', phase: 'build'
    });
    slotsFree = false;
    const profiling = profilingWith(() => Promise.resolve(passedRun()));

    profiling.followRuns(await storedBoard());
    await profiling.idle();

    expect(lineRequests).toEqual([]);
    expect((await storedBoard()).gateProfileRuns()[0]?.state).toBe('queued');
  });

  testWhenGitIsRecorded('of an entity\'s gate runs its lines in the entity\'s folders from the worktree\'s root, and ends kept by its entity', async () => {
    await writeTracker({
      workspace,
      at:     CHANGED_AT,
      now,
      mutate: (change) => change.board.queueGateProfile({
        setupId: null,
        entity:  'web',
        phase:   'build',
        gate:    { name: 'tests', run: 'bun test', in: '/apps/web' },
        prepare: [{ name: 'install', run: 'bun install', in: '/' }],
      }, change.at),
    });
    const profiling = profilingWith(() => Promise.resolve(passedRun()));

    await recordedGit.playStage(worktreeAddAndRemoveOf('P1'), async () => {
      profiling.followRuns(await storedBoard());
      await profiling.idle();
    });

    expect(lineRequests[0]).toMatchObject({
      directory:     worktreeOf('P1'),
      projectPrefix: '',
      prepare:       [{ name: 'install', run: 'bun install', in: '/' }],
      gates:         [{ name: 'tests', run: 'bun test', in: '/apps/web' }],
    });
    expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ profileRunId: 'P1', entity: 'web', state: 'passed' }]);
    expect(loggedStepRuns()).toEqual([{
      stepKind: 'gate', stepName: 'tests', phase: 'build', entity: 'web', runMilliseconds: PROFILED_MILLISECONDS, ending: 'passed'
    }]);
  });

  testWhenGitIsRecorded('a red gate ends red with its time', async () => {
    await storeAPipeline();
    await applied({
      kind: 'gate-profile-start', setupId: null, gateName: 'tests', phase: 'build'
    });
    const profiling = profilingWith(() => Promise.resolve({
      failedStep:    null,
      prepareOutput: '',
      gates:         [{
        outcome: 'failed', milliseconds: 900, stoppedAtTimeBound: false, cacheReport: null, output: 'example red', stepRun: stepRunOf(900, 'failed')
      }]
    }));

    await recordedGit.playStage(worktreeAddAndRemoveOf('P1'), async () => {
      profiling.followRuns(await storedBoard());
      await profiling.idle();
    });

    expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ state: 'red', elapsedMilliseconds: 900 }]);
  });
});

testWhenGitIsRecorded('a Stop of a running run sends stop to its running line and records it stopped, with no duration', async () => {
  await storeAPipeline();
  await applied({
    kind: 'gate-profile-start', setupId: null, gateName: 'tests', phase: 'build'
  });
  const profiling = profilingWith(stoppableRun);

  await recordedGit.playStage(worktreeAddAndRemoveOf('P1'), async () => {
    profiling.followRuns(await storedBoard());
    await waitUntil(() => runnerRequests.length > 0, 'the profile line never started');
    await applied({ kind: 'gate-profile-stop', profileRunId: 'P1' });
    profiling.followRuns(await storedBoard());
    expect(runnerRequests.map((request) => request.stopSignal?.aborted)).toEqual([true]);
    await profiling.idle();
  });

  expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ state: 'stopped', elapsedMilliseconds: null, stopRequested: false }]);
  expect(readFileSync(workspace.logFilePath, 'utf8')).toContain('"kind":"gate-profile-stopped"');
  expect(loggedStepRuns()).toEqual([]);
});

testWhenGitIsRecorded('an Overseer stop sends stop to a running run\'s line and records it stopped, with no duration', async () => {
  await storeAPipeline();
  await applied({
    kind: 'gate-profile-start', setupId: null, gateName: 'tests', phase: 'build'
  });
  const profiling = profilingWith(stoppableRun);

  await recordedGit.playStage(worktreeAddAndRemoveOf('P1'), async () => {
    profiling.followRuns(await storedBoard());
    await waitUntil(() => runnerRequests.length > 0, 'the profile line never started');
    const stopped = profiling.stopAll();
    expect(runnerRequests.map((request) => request.stopSignal?.aborted)).toEqual([true]);
    await stopped;
  });

  expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ state: 'stopped', elapsedMilliseconds: null, stopRequested: false }]);
  expect(readFileSync(workspace.logFilePath, 'utf8')).toContain('"kind":"gate-profile-stopped"');
});

testWhenGitIsRecorded('the next start stops the lines an earlier Overseer left before it removes their worktrees', async () => {
  const worktree = worktreeOf('P1');
  mkdirSync(worktree, { recursive: true });
  const profiling = profilingWith(() => Promise.resolve(passedRun()));

  await recordedGit.playStage([
    { gitArguments: ['worktree', 'remove', '--force', worktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_LINKED, removesFolder: worktree },
  ], () => profiling.settleAtStart());

  expect(leftoverLineStops).toEqual([{ folder: join(workspace.trackerDirectory, GATE_PROFILE_RUNS_FOLDER), worktreesThen: true }]);
  expect(existsSync(worktree)).toBe(false);
});

describe('nothing but User\'s press queues a run', () => {
  test('a proposal, a draft edit and an Overseer start queue none, so no line runs', async () => {
    await storeAPipeline();
    await applied({ kind: 'pipeline-update-start' });
    await applied({
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 0,
      edits:         [{ target: 'gate', name: 'lint', value: { name: 'lint', run: 'bun run lint' } }, { target: 'phase-order', phase: 'build', names: ['tests', 'lint'] }],
    });
    await applied({
      kind: 'pipeline-draft-propose', jobId: 'J1', setupId: 'S1', edits: [{ field: 'review', value: { name: 'Review' }, summary: 'Review every ticket.' }]
    });
    const profiling = profilingWith(() => Promise.resolve(passedRun()));

    await recordedGit.playStage([], async () => {
      await profiling.settleAtStart();
      profiling.followRuns(await storedBoard());
      await profiling.idle();
    });

    expect((await storedBoard()).gateProfileRuns()).toEqual([]);
    expect(lineRequests).toEqual([]);
  });
});

testWhenGitIsRecorded('a run of the open setup turns a slow gate with no caching tool into a note finding, once', async () => {
  await storeAPipeline();
  await applied({ kind: 'pipeline-update-start' });
  await applied({
    kind: 'gate-profile-start', setupId: 'S1', gateName: 'tests', phase: 'build'
  });
  const profiling = profilingWith(() => Promise.resolve(passedRun(SLOW_GATE_MILLISECONDS)));

  await recordedGit.playStage(worktreeAddAndRemoveOf('P1'), async () => {
    profiling.followRuns(await storedBoard());
    await profiling.idle();
  });
  await applied({
    kind: 'gate-profile-start', setupId: 'S1', gateName: 'tests', phase: 'merge'
  });
  await recordedGit.playStage(worktreeAddAndRemoveOf('P2'), async () => {
    profiling.followRuns(await storedBoard());
    await profiling.idle();
  });

  expect((await storedBoard()).pipelineSetup()?.findings).toEqual([{
    findingId: 'F1', topic: 'note', label: 'no-caching-tool', value: 'tests', sourcePaths: [], script: null, needsRecheck: false
  }]);
});

testWhenGitIsRecorded('runs of two entities that share a slow gate\'s name each record their own note, in their own part of the record', async () => {
  const entityOf = (home: string): PipelineEntity => ({
    kind: 'app', home: [home], prepare: [], gates: [{ name: 'tests', run: 'bun test' }], phases: { build: ['tests'], review: [], merge: [] },
  });
  const pipeline: Pipeline = {
    version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, entities: { web: entityOf('/apps/web/'), api: entityOf('/apps/api/') },
  };
  const { board } = boardFixture({ pipeline });
  board.openSetup({
    mode: 'update', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  }, CHANGED_AT);
  const profiling = profilingWith(() => Promise.resolve(passedRun(SLOW_GATE_MILLISECONDS)), (mutate) => Promise.resolve(mutate({ board, at: CHANGED_AT })));

  for (const [profileRunId, entity] of [['P1', 'web'], ['P2', 'api']] as const) {
    board.queueGateProfile({
      setupId: 'S1', entity, phase: 'build', gate: { name: 'tests', run: 'bun test', in: `/apps/${entity}` }, prepare: []
    }, CHANGED_AT);
    await recordedGit.playStage(worktreeAddAndRemoveOf(profileRunId), async () => {
      profiling.followRuns(board);
      await profiling.idle();
    });
  }

  const noteOf = (findingId: string): ResearchFinding => ({
    findingId, topic: 'note', label: 'no-caching-tool', value: 'tests', sourcePaths: [], script: null, needsRecheck: false
  });
  const setup = board.pipelineSetup();
  expect(setup?.findings).toEqual([]);
  expect(setup?.entities?.['web']?.findings).toEqual([noteOf('F1')]);
  expect(setup?.entities?.['api']?.findings).toEqual([noteOf('F2')]);
});
