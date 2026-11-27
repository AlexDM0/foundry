/**
 * Hephaestus's gate profiles with real gate lines and the real process port; git's worktree answers come from
 * `src/testing/RecordedGit.ts`. What matters: a profile runs its prepare step and its gate as real processes in its worktree, and its output
 * is appended to its file as the lines print it; and a Stop ends the real process tree through the port, so the run is recorded `stopped`
 * with no duration, while the line would otherwise have run for minutes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterEach, beforeEach, expect } from 'bun:test';

import type { Board }                                                             from '../../domain/tracker-model/Board.ts';
import type { ControlCommand }                                                    from '../../shared/@types/ControlCommand.ts';
import { environmentCopy }                                                        from '../../shared/Environment.ts';
import { WorktreesFolder }                                                        from '../../shared/WorktreesFolder.ts';
import { ECHOED_CONTROL_CONTEXT }                                                 from '../../testing/EchoedControlContext.ts';
import { runsAsGiven }                                                            from '../../testing/FakeGateConfinement.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                                                from '../../testing/LockTakers.ts';
import { nativePlatformPorts }                                                    from '../../testing/NativePlatformPorts.ts';
import { GIT_CALL_SHAPES, type RecordedGitStage, useRecordedGit }                 from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }                         from '../../testing/ScratchWorkspace.ts';
import { spawnedLineRunner }                                                      from '../../testing/SpawnedLineRunner.ts';
import { testWhenGitIsRecorded }                                                  from '../../testing/ToolGuard.ts';
import { writeReadableTracker }                                                   from '../../testing/TrackerFileFixtures.ts';
import { waitUntil }                                                              from '../../testing/WaitUntil.ts';
import { ControlService }                                                         from '../control/ControlService.ts';
import { GateLineRun }                                                            from '../lifecycle/GateLineRun.ts';
import { writeTracker }                                                           from '../tracker/TrackerPipeline.ts';
import { workspacePathsFor, type Workspace }                                      from '../tracker/Workspace.ts';
import { GATE_PROFILE_RUNS_FOLDER, GATE_PROFILE_WORKTREES_FOLDER, GateProfiling } from './GateProfiling.ts';

const CHANGED_AT = '2026-11-12T10:00:00+01:00';
const MAIN_LINE = 'main';
const TREE_UNCHANGED = { gitArguments: ['diff', '--no-ext-diff', 'HEAD', '--'], answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE };

const recordedGit = useRecordedGit();

let repository = '';
let workspace: Workspace;

const now = (): Date => new Date('2026-11-12T09:00:00Z');

beforeEach(() => {
  repository = createScratchDirectory('gate-profiling-real');
  workspace = workspacePathsFor(repository);
  writeReadableTracker(workspace);
});

afterEach(() => {
  removeScratchDirectory(repository);
});

async function applied(command: ControlCommand): Promise<void> {
  await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace,
    at:        CHANGED_AT,
    now,
    mutate:    (change) => ControlService.apply(command, change, ECHOED_CONTROL_CONTEXT)
  });
}

async function storedBoard(): Promise<Board> {
  return (await writeTracker({
    lockTaker: LIVE_HOLDERS_LOCK_TAKER,
    workspace,
    at:        CHANGED_AT,
    now,
    mutate:    () => undefined
  })).board;
}

function worktreeOf(profileRunId: string): string {
  return join(WorktreesFolder.worktreesRootOf(repository), GATE_PROFILE_WORKTREES_FOLDER, profileRunId);
}

/** The worktree added, the gate's tree read once, and the worktree removed. */
/** The tree is read unchanged after each prepare step and after the gate. */
function profileStageOf(profileRunId: string, prepareStepCount: number): RecordedGitStage {
  const worktree = worktreeOf(profileRunId);
  return [
    { gitArguments: ['worktree', 'add', '--quiet', '--detach', worktree, MAIN_LINE], answeredAs: GIT_CALL_SHAPES.WORKTREE_ADD_DETACHED, leavesFolder: worktree },
    ...Array.from({ length: prepareStepCount + 1 }, () => TREE_UNCHANGED),
    { gitArguments: ['worktree', 'remove', '--force', worktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_LINKED, removesFolder: worktree },
  ];
}

function realProfiling(): ReturnType<typeof GateProfiling.createGateProfiling> {
  return GateProfiling.createGateProfiling({
    workspace,
    worktreesRoot:   WorktreesFolder.worktreesRootOf(repository),
    mainLine:        MAIN_LINE,
    platformPorts:   nativePlatformPorts(),
    gateSlots:       { tryAcquireAfterRealGates: () => true, release: () => undefined },
    gateEnvironment: environmentCopy,
    confinedLineIn:  () => runsAsGiven,
    hold:            async (mutate) => (await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => mutate({ board: change.board, at: change.at })
    })).result,
    wake:               () => undefined,
    log:                () => undefined,
    runGateLines:       (request) => GateLineRun.runOnce(request),
    runLine:            spawnedLineRunner,
    stopLiveLinesUnder: () => Promise.resolve(),
  });
}

function outputOf(profileRunId: string): string {
  const outputPath = join(workspace.trackerDirectory, GATE_PROFILE_RUNS_FOLDER, `${profileRunId}.ndjson`);
  if (!existsSync(outputPath)) return '';
  return readFileSync(outputPath, 'utf8').split('\n').filter((line) => line !== '').map((line) => (JSON.parse(line) as { text: string }).text).join('');
}

testWhenGitIsRecorded('a profile runs its prepare step and its gate as real processes in its worktree, its output appended as it prints', async () => {
  await applied({ kind: 'pipeline-prepare-step-set', step: { name: 'install', run: 'echo prepared > prepared.txt' } });
  await applied({ kind: 'pipeline-gate-add', gate: { name: 'tests', run: 'cat prepared.txt; echo profiled' } });
  await applied({
    kind: 'gate-profile-start', setupId: null, gateName: 'tests', phase: 'build'
  });
  const profiling = realProfiling();

  await recordedGit.playStage(profileStageOf('P1', 1), async () => {
    profiling.followRuns(await storedBoard());
    await profiling.idle();
  });

  expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ profileRunId: 'P1', state: 'passed' }]);
  expect(outputOf('P1')).toContain('prepared');
  expect(outputOf('P1')).toContain('profiled');
});

testWhenGitIsRecorded('a Stop ends the real line and every process it started, and the run is recorded stopped with no duration', async () => {
  await applied({ kind: 'pipeline-gate-add', gate: { name: 'slow', run: 'echo started; sleep 600 & wait' } });
  await applied({
    kind: 'gate-profile-start', setupId: null, gateName: 'slow', phase: 'merge'
  });
  const profiling = realProfiling();

  await recordedGit.playStage(profileStageOf('P1', 0), async () => {
    profiling.followRuns(await storedBoard());
    await waitUntil(() => outputOf('P1').includes('started'), 'the slow gate never started');
    await applied({ kind: 'gate-profile-stop', profileRunId: 'P1' });
    profiling.followRuns(await storedBoard());
    await profiling.idle();
  });

  expect((await storedBoard()).gateProfileRuns()).toMatchObject([{ state: 'stopped', elapsedMilliseconds: null }]);
});
