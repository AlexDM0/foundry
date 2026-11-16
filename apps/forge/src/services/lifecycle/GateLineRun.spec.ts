/**
 * One run of prepare steps and gates, over recorded gate lines and recorded git. What matters: each line's output reaches the listener as
 * it arrives and its process id is told once it started, so a gate profile can stream it and stop its tree; a gate is recorded with its
 * outcome and measured time; with writes not granted, no prepare step and no gate is confined with a `writes` folder, while a granted run
 * keeps them; and a gate that changed the checkout fails and the checkout is restored (`ProposalTwiceRun.spec.ts` holds the ceiling of that
 * restore). A prepare step that exits 0 but changes a tracked file fails the prepare with its diff, never the first gate, and is restored.
 */
import { afterEach, beforeEach, expect } from 'bun:test';

import type { PipelineGate }                              from '../../lib/tracker-model/@types/Pipeline.ts';
import { environmentCopy }                                from '../../shared/Environment.ts';
import { runsAsGiven }                                    from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { RECORDED_GATE_LINES, useRecordedGateSpawns }     from '../../testing/RecordedGateLines.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                          from '../../testing/ToolGuard.ts';
import { GateLineRun, type GateLineRunRequest }           from './GateLineRun.ts';
import type { GateConfinement }                           from './GateRun.ts';

const TRACKED_CHANGES_ARGUMENTS = ['diff', '--no-ext-diff', 'HEAD', '--'];
const MEASURED_MILLISECONDS = 250;

const recordedGit = useRecordedGit();
useRecordedGateSpawns();

let checkoutDirectory = '';

beforeEach(() => {
  checkoutDirectory = createScratchDirectory('gate-line-run');
});

afterEach(() => {
  removeScratchDirectory(checkoutDirectory);
});

function requestOf(gates: readonly PipelineGate[], overrides: Partial<GateLineRunRequest> = {}): GateLineRunRequest {
  let clock = 0;
  return {
    shellLine:       nativePlatformPorts().shellLine,
    spawnOptions:    nativePlatformPorts().processSupervision.spawnOptionsFor('gate'),
    environment:     environmentCopy(),
    confinedLineOf:  runsAsGiven,
    prepare:         [],
    gates,
    directory:       checkoutDirectory,
    grantsWrites:    false,
    millisecondsNow: () => {
      clock += MEASURED_MILLISECONDS;
      return clock;
    },
    ...overrides,
  };
}

testWhenGitIsRecorded('a red gate\'s output reaches the listener, its process id is told, and it is recorded failed with its time', async () => {
  const pieces: string[] = [];
  const processIds: number[] = [];

  const run = await recordedGit.playStage([{ gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE }], () => GateLineRun.runOnce(requestOf(
    [{ name: 'tests', run: RECORDED_GATE_LINES.RED }],
    { onOutput: (text) => pieces.push(text), onSpawned: (processId) => processIds.push(processId) },
  )));

  if ('verdict' in run) throw new Error(`the run was refused: ${run.reason}`);
  expect(run.gates).toEqual([{
    outcome: 'failed', milliseconds: MEASURED_MILLISECONDS, cacheReport: null, output: pieces.join('')
  }]);
  expect(pieces.join('')).toContain('example-red');
  expect(processIds).toHaveLength(1);
});

testWhenGitIsRecorded('with writes not granted, no line is confined with a writes folder; a granted run keeps the gate\'s', async () => {
  const gate: PipelineGate = { name: 'browser-tests', run: RECORDED_GATE_LINES.GREEN, writes: ['/example-cache'] };
  const prepare = [{ name: 'install', run: RECORDED_GATE_LINES.GREEN }];
  const confinementsOf = async (grantsWrites: boolean): Promise<GateConfinement[]> => {
    const confinements: GateConfinement[] = [];
    const treeUnchanged = { gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE };
    await recordedGit.playStage([treeUnchanged, treeUnchanged], () => GateLineRun.runOnce(requestOf([gate], {
      prepare,
      grantsWrites,
      confinedLineOf: (argv, confinement) => {
        confinements.push(confinement);
        return runsAsGiven(argv);
      },
    })));
    return confinements;
  };

  expect((await confinementsOf(false)).map((confinement) => confinement.writes)).toEqual([[], []]);
  expect((await confinementsOf(true)).map((confinement) => confinement.writes)).toEqual([['/example-cache'], ['/example-cache']]);
});

testWhenGitIsRecorded('a gate that changed the checkout fails, and the checkout is restored', async () => {
  const run = await recordedGit.playStage([
    { gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_A_REFORMATTED_FILE },
    { gitArguments: ['checkout', '-q', '--', '.'], answeredAs: GIT_CALL_SHAPES.CHECKOUT_OF_A_REFORMATTED_FILE },
  ], () => GateLineRun.runOnce(requestOf([{ name: 'formats', run: RECORDED_GATE_LINES.GREEN }])));

  if ('verdict' in run) throw new Error(`the run was refused: ${run.reason}`);
  expect(run.gates[0]?.outcome).toBe('failed');
});

testWhenGitIsRecorded('a prepare step that changed the checkout fails the prepare with its diff, judges no gate, and is restored', async () => {
  const run = await recordedGit.playStage([
    { gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_A_REFORMATTED_FILE },
    { gitArguments: ['checkout', '-q', '--', '.'], answeredAs: GIT_CALL_SHAPES.CHECKOUT_OF_A_REFORMATTED_FILE },
  ], () => GateLineRun.runOnce(requestOf([{ name: 'tests', run: RECORDED_GATE_LINES.GREEN }], { prepare: [{ name: 'install', run: RECORDED_GATE_LINES.GREEN }] })));

  if ('verdict' in run) throw new Error(`the run was refused: ${run.reason}`);
  expect(run.failedStep).toBe('install');
  expect(run.prepareOutput).toContain('source.txt');
  expect(run.gates.map((gate) => gate.outcome)).toEqual(['cannot-run']);
});
