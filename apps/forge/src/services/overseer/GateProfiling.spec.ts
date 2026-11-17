/**
 * The Overseer's gate profiles, on recorded git, a fake process port and a stand-in for the gate lines. What matters: a queued run runs
 * once, one gate in one phase, in a fresh detached worktree of main at `<worktrees>/gate-profiles/<P>`, with the prepare steps and no
 * `writes` granted, holding a slot it takes only after the real gates; its output is appended as it arrives; it ends with its time, never a
 * green or a `gate-ran` record, and its worktree and slot go; a Stop, and an Overseer stop, end the process tree through the port and
 * record `stopped` with no duration; a proposal, a draft edit and a start queue no run; a run of the open setup turns the caching
 * checks into note findings; and a run of an entity's gate runs its lines in the folders the press took from the entity's first home. Two
 * entities that share a gate name each get their own note, in their own part of the record, never one in the forge's part.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { ProcessIdentity }                           from '../../lib/process-identity/ProcessIdentity.ts';
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
const PROFILE_PROCESS_ID = 4242;

const recordedGit = useRecordedGit();

let repository = '';
let workspace: Workspace;
let lineRequests: GateLineRunRequest[];
let stoppedLeaders: ProcessIdentity[];
let slotsFree: boolean;
let heldSlots: string[];

const now = (): Date => new Date('2026-11-12T09:00:00Z');

beforeEach(() => {
  repository = createScratchDirectory('gate-profiling');
  workspace = workspacePathsFor(repository);
  writeReadableTracker(workspace);
  lineRequests = [];
  stoppedLeaders = [];
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

function passedRun(milliseconds = PROFILED_MILLISECONDS): GateLinesRun {
  return {
    failedStep:    null,
    prepareOutput: '',
    gates:         [{
      outcome: 'passed', milliseconds, cacheReport: null, output: ''
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
    platformPorts: {
      shellLine:          native.shellLine,
      processSupervision: {
        ...native.processSupervision,
        identityOf:    (processId) => ({ processId, startStamp: '1', bootIdentity: 'example-boot' }),
        treeMembersOf: () => [],
        stopTree:      (leader) => {
          stoppedLeaders.push(leader);
          return { verdict: 'signalled' };
        },
      },
    },
    gateSlots: {
      tryAcquireAfterRealGates: (holder) => {
        if (slotsFree) heldSlots.push(holder);
        return slotsFree;
      },
      release: (holder) => { heldSlots = heldSlots.filter((held) => held !== holder); },
    },
    gateEnvironment: () => ({}),
    confinedLineIn:  () => (argv) => ({ verdict: 'runs', argv }),
    hold,
    millisecondsNow: () => 0,
    wake:            () => undefined,
    log:             () => undefined,
    runGateLines:    (request) => {
      lineRequests.push(request);
      return runGateLines(request);
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
      request.onSpawned?.(PROFILE_PROCESS_ID);
      request.onOutput?.('example output\n');
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
      grantsWrites: false,
      prepare:      [{ name: 'install', run: 'bun install --frozen-lockfile' }],
      gates:        [{ name: 'tests', run: 'bun test', network: ['registry.npmjs.org'] }],
    });
    expect(lineRequests[0]?.gates[0]).not.toHaveProperty('writes');
    expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ profileRunId: 'P1', state: 'passed', elapsedMilliseconds: PROFILED_MILLISECONDS }]);
    const logged = readFileSync(workspace.logFilePath, 'utf8');
    expect(logged).toContain('"kind":"gate-profiled"');
    expect(logged).not.toContain('"kind":"gate-ran"');
    expect(readFileSync(join(workspace.trackerDirectory, GATE_PROFILE_RUNS_FOLDER, 'P1.ndjson'), 'utf8')).toBe('{"text":"example output\\n"}\n');
    expect(existsSync(worktreeOf('P1'))).toBe(false);
    expect(heldSlots).toEqual([]);
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
        outcome: 'failed', milliseconds: 900, cacheReport: null, output: 'example red'
      }]
    }));

    await recordedGit.playStage(worktreeAddAndRemoveOf('P1'), async () => {
      profiling.followRuns(await storedBoard());
      await profiling.idle();
    });

    expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ state: 'red', elapsedMilliseconds: 900 }]);
  });
});

testWhenGitIsRecorded('a Stop of a running run ends its process tree through the port and records it stopped, with no duration', async () => {
  await storeAPipeline();
  await applied({
    kind: 'gate-profile-start', setupId: null, gateName: 'tests', phase: 'build'
  });
  let endTheLine = (): void => undefined;
  const profiling = profilingWith((request) => new Promise((resolve) => {
    request.onSpawned?.(PROFILE_PROCESS_ID);
    endTheLine = () => resolve({
      failedStep:    null,
      prepareOutput: '',
      gates:         [{
        outcome: 'failed', milliseconds: 10, cacheReport: null, output: ''
      }]
    });
  }));

  await recordedGit.playStage(worktreeAddAndRemoveOf('P1'), async () => {
    profiling.followRuns(await storedBoard());
    await waitUntil(() => lineRequests.length > 0, 'the profile line never started');
    await applied({ kind: 'gate-profile-stop', profileRunId: 'P1' });
    profiling.followRuns(await storedBoard());
    expect(stoppedLeaders.map((leader) => leader.processId)).toEqual([PROFILE_PROCESS_ID]);
    endTheLine();
    await profiling.idle();
  });

  expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ state: 'stopped', elapsedMilliseconds: null, stopRequested: false }]);
  expect(readFileSync(workspace.logFilePath, 'utf8')).toContain('"kind":"gate-profile-stopped"');
});

testWhenGitIsRecorded('an Overseer stop ends a running run\'s process tree through the port and records it stopped, with no duration', async () => {
  await storeAPipeline();
  await applied({
    kind: 'gate-profile-start', setupId: null, gateName: 'tests', phase: 'build'
  });
  let endTheLine = (): void => undefined;
  const profiling = profilingWith((request) => new Promise((resolve) => {
    request.onSpawned?.(PROFILE_PROCESS_ID);
    endTheLine = () => resolve({
      failedStep:    null,
      prepareOutput: '',
      gates:         [{
        outcome: 'failed', milliseconds: 10, cacheReport: null, output: ''
      }]
    });
  }));

  await recordedGit.playStage(worktreeAddAndRemoveOf('P1'), async () => {
    profiling.followRuns(await storedBoard());
    await waitUntil(() => lineRequests.length > 0, 'the profile line never started');
    const stopped = profiling.stopAll();
    expect(stoppedLeaders.map((leader) => leader.processId)).toEqual([PROFILE_PROCESS_ID]);
    endTheLine();
    await stopped;
  });

  expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ state: 'stopped', elapsedMilliseconds: null, stopRequested: false }]);
  expect(readFileSync(workspace.logFilePath, 'utf8')).toContain('"kind":"gate-profile-stopped"');
});

describe('nothing but User\'s press queues a run', () => {
  test('a proposal, a draft edit and an Overseer start queue none, so no line runs', async () => {
    await storeAPipeline();
    await applied({ kind: 'pipeline-update-start' });
    await applied({
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 0,
      edits:         [{ field: 'gate:lint', value: { name: 'lint', run: 'bun run lint' } }, { field: 'phase-order:build', value: ['tests', 'lint'] }],
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
