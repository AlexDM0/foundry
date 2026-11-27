/**
 * One run of prepare steps and gates, over a line runner of recorded gate lines and recorded git. What matters: each line runs in its own
 * step folder of the run's child folder and its output lines reach the listener, so a gate profile can stream it; a gate is recorded with
 * its outcome and its line's run time, the time Talos measured; with writes not granted, no prepare step and no gate is confined with a
 * `writes` folder, while a granted run keeps them; and a gate that changed the checkout fails and the checkout is restored
 * (`ProposalTwiceRun.spec.ts` holds the ceiling of that restore). A prepare step that exits 0 but changes a tracked file fails the prepare
 * with its diff, never the first gate, and is restored.
 */
import { afterEach, beforeEach, expect } from 'bun:test';

import type { PipelineGate }                                                         from '../../lib/tracker-model/@types/Pipeline.ts';
import { environmentCopy }                                                           from '../../shared/Environment.ts';
import { runsAsGiven }                                                               from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                                       from '../../testing/NativePlatformPorts.ts';
import { RECORDED_GATE_LINES, RECORDED_LINE_RUN_MILLISECONDS, useRecordedGateLines } from '../../testing/RecordedGateLines.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                                           from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }                            from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                                     from '../../testing/ToolGuard.ts';
import { GateLineRun, type GateLineRunRequest }                                      from './GateLineRun.ts';
import type { GateConfinement }                                                      from './GateRun.ts';

const TRACKED_CHANGES_ARGUMENTS = ['diff', '--no-ext-diff', 'HEAD', '--'];
const RUN_FOLDER = '/example/board/gate-profile-runs/P1';

const recordedGit = useRecordedGit();
const recordedGateLines = useRecordedGateLines();

let checkoutDirectory = '';

beforeEach(() => {
  checkoutDirectory = createScratchDirectory('gate-line-run');
});

afterEach(() => {
  removeScratchDirectory(checkoutDirectory);
});

function requestOf(gates: readonly PipelineGate[], overrides: Partial<GateLineRunRequest> = {}): GateLineRunRequest {
  return {
    shellLine:      nativePlatformPorts().shellLine,
    environment:    environmentCopy(),
    confinedLineOf: runsAsGiven,
    runLine:        recordedGateLines.runLine,
    childFolder:    RUN_FOLDER,
    prepare:        [],
    gates,
    directory:      checkoutDirectory,
    grantsWrites:   false,
    ...overrides,
  };
}

testWhenGitIsRecorded('a red gate\'s output reaches the listener, its line runs in its step folder, and it is recorded failed with its run time', async () => {
  const outputLines: string[] = [];
  recordedGateLines.takeLineRequests();

  const run = await recordedGit.playStage([{ gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE }], () => GateLineRun.runOnce(requestOf(
    [{ name: 'tests', run: RECORDED_GATE_LINES.RED }],
    { onOutputLine: (line) => outputLines.push(line) },
  )));

  if ('verdict' in run) throw new Error(`the run was refused: ${run.refusal.code}`);
  expect(run.gates).toEqual([{
    outcome:            'failed',
    milliseconds:       RECORDED_LINE_RUN_MILLISECONDS,
    stoppedAtTimeBound: false,
    cacheReport:        null,
    output:             'example-red\n',
    stepRun:            {
      stepKind: 'gate', stepName: 'tests', runMilliseconds: RECORDED_LINE_RUN_MILLISECONDS, ending: 'failed'
    },
  }]);
  expect(outputLines).toEqual(['example-red']);
  expect(recordedGateLines.takeLineRequests().map((lineRequest) => lineRequest.childFolder)).toEqual([`${RUN_FOLDER}/gate-1`]);
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

  if ('verdict' in run) throw new Error(`the run was refused: ${run.refusal.code}`);
  expect(run.gates[0]?.outcome).toBe('failed');
});

testWhenGitIsRecorded('a prepare step that changed the checkout fails the prepare with its diff, judges no gate, and is restored', async () => {
  const run = await recordedGit.playStage([
    { gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_A_REFORMATTED_FILE },
    { gitArguments: ['checkout', '-q', '--', '.'], answeredAs: GIT_CALL_SHAPES.CHECKOUT_OF_A_REFORMATTED_FILE },
  ], () => GateLineRun.runOnce(requestOf([{ name: 'tests', run: RECORDED_GATE_LINES.GREEN }], { prepare: [{ name: 'install', run: RECORDED_GATE_LINES.GREEN }] })));

  if ('verdict' in run) throw new Error(`the run was refused: ${run.refusal.code}`);
  expect(run.failedStep).toBe('install');
  expect(run.prepareOutput).toContain('source.txt');
  expect(run.gates.map((gate) => gate.outcome)).toEqual(['cannot-run']);
});
