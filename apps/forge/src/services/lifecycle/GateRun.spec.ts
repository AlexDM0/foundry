/**
 * A gate pipeline over a line runner of recorded gate lines and recorded git. What matters: every line runs in its own step folder of the
 * run's child folder, prepare steps and gates alike, within the line time bound, and the caller hears each line's output; a gate's slot is
 * held by the gate's child folder, and a line Talos paused is never judged. A
 * prepare step that exits 0 but changes a tracked file is a setup failure naming that step, never the red first gate it would make. A
 * prepare step with a folder runs in it, as a gate with one does. A gate's environment carries its own report path and never one this
 * process inherited. A step a line child runs has one report path per step folder, read in a later pass, which a take removes.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir }                    from 'node:os';
import { dirname, join }             from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { environmentCopy, GATE_REPORT_VARIABLE, JOB_ID_VARIABLE } from '../../shared/Environment.ts';
import { LINE_TIME_BOUND_MILLISECONDS }                           from '../../shared/constants/OverseerLimits.ts';
import { runsAsGiven }                                            from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                    from '../../testing/NativePlatformPorts.ts';
import { RECORDED_GATE_LINES, useRecordedGateLines }              from '../../testing/RecordedGateLines.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                        from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                  from '../../testing/ToolGuard.ts';
import { GateRun, LinePausedError }                               from './GateRun.ts';

const TRACKED_CHANGES_ARGUMENTS = ['diff', '--no-ext-diff', 'HEAD', '--'];
const TREE_UNCHANGED = { gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE };

const recordedGit = useRecordedGit();
const recordedGateLines = useRecordedGateLines();

let checkoutDirectory = '';

beforeEach(() => {
  checkoutDirectory = createScratchDirectory('gate-run');
});

afterEach(() => {
  removeScratchDirectory(checkoutDirectory);
});

const RUN_FOLDER = '/example/board/merge-gates/0123456789abcdef';

testWhenGitIsRecorded('each step runs in its own folder of the run within the line bound, a gate\'s slot is held by its folder, and the red output is heard', async () => {
  const outputLines: string[] = [];
  const slotHolders: string[] = [];
  const { shellLine } = nativePlatformPorts();

  const verdict = await recordedGit.playStage([TREE_UNCHANGED, TREE_UNCHANGED, TREE_UNCHANGED], () => GateRun.runPipeline({
    shellLine,
    prepare:         [{ name: 'install', run: RECORDED_GATE_LINES.GREEN }],
    gates:           [{ name: 'lint', run: RECORDED_GATE_LINES.GREEN }, { name: 'tests', run: RECORDED_GATE_LINES.RED }],
    directory:       checkoutDirectory,
    environment:     environmentCopy(),
    confinedLineOf:  runsAsGiven,
    runLine:         recordedGateLines.runLine,
    childFolder:     RUN_FOLDER,
    acquireGateSlot: (holder) => {
      slotHolders.push(holder);
      return Promise.resolve(() => undefined);
    },
    onOutputLine: (line) => outputLines.push(line),
  }));

  const lineRequests = recordedGateLines.takeLineRequests();
  expect(verdict).toMatchObject({ outcome: 'failed', gate: 'tests', output: 'example-red\n' });
  expect(lineRequests.map((lineRequest) => lineRequest.childFolder)).toEqual([
    join(RUN_FOLDER, 'prepare-1'), join(RUN_FOLDER, 'gate-1'), join(RUN_FOLDER, 'gate-2'),
  ]);
  expect(lineRequests.map((lineRequest) => lineRequest.timeBoundMilliseconds)).toEqual([
    LINE_TIME_BOUND_MILLISECONDS, LINE_TIME_BOUND_MILLISECONDS, LINE_TIME_BOUND_MILLISECONDS,
  ]);
  expect(slotHolders).toEqual([join(RUN_FOLDER, 'gate-1'), join(RUN_FOLDER, 'gate-2')]);
  expect(outputLines).toEqual(['example-red']);
});

test('a gate Talos stopped at its bound cannot run and says so; one no Talos took cannot run either; a paused one is never judged', async () => {
  const { shellLine } = nativePlatformPorts();
  const runOf = (endReason: 'time-bound' | 'talos-unavailable' | 'paused') => GateRun.runGate({
    argv:        ['/example/gate'],
    directory:   checkoutDirectory,
    environment: {},
    childFolder: join(RUN_FOLDER, 'gate-1'),
    runLine:     () => Promise.resolve({
      exitCode: null, signalCode: null, endReason, output: 'example output\n', runMilliseconds: 0
    }),
  });

  const timedOut = await runOf('time-bound');
  const unavailable = await runOf('talos-unavailable');

  expect([GateRun.gateOutcomeOf(shellLine, timedOut), GateRun.gateOutcomeOf(shellLine, unavailable)]).toEqual(['cannot-run', 'cannot-run']);
  expect(timedOut.output).toBe(`example output\n${GateRun.timeBoundLineOf(LINE_TIME_BOUND_MILLISECONDS)}\n`);
  expect(unavailable.output).toContain('Talos did not run the line');
  expect(runOf('paused')).rejects.toBeInstanceOf(LinePausedError);
});

testWhenGitIsRecorded('a prepare step that exits 0 but changes a tracked file is a setup failure naming it, and no gate runs', async () => {
  const { shellLine } = nativePlatformPorts();

  const verdict = await recordedGit.playStage([{ gitArguments: TRACKED_CHANGES_ARGUMENTS, answeredAs: GIT_CALL_SHAPES.DIFF_OF_A_REFORMATTED_FILE }], () => GateRun.runPipeline({
    shellLine,
    prepare:        [{ name: 'install', run: RECORDED_GATE_LINES.GREEN }],
    gates:          [{ name: 'tests', run: RECORDED_GATE_LINES.GREEN }],
    directory:      checkoutDirectory,
    environment:    environmentCopy(),
    confinedLineOf: runsAsGiven,
    runLine:        recordedGateLines.runLine,
    childFolder:    RUN_FOLDER,
  }));
  recordedGateLines.takeLineRequests();

  expect(verdict).toMatchObject({ outcome: 'setup-failed', step: 'install', gatesRun: [] });
  expect('output' in verdict ? verdict.output : '').toContain('source.txt');
});

testWhenGitIsRecorded('a prepare step and a gate with a folder each run in that folder of the checkout', async () => {
  const { shellLine } = nativePlatformPorts();
  recordedGateLines.takeLineRequests();

  await recordedGit.playStage([TREE_UNCHANGED, TREE_UNCHANGED], () => GateRun.runPipeline({
    shellLine,
    prepare:        [{ name: 'install', run: RECORDED_GATE_LINES.GREEN, in: 'packages/example' }],
    gates:          [{ name: 'tests', run: RECORDED_GATE_LINES.GREEN, in: 'docs' }],
    directory:      checkoutDirectory,
    environment:    environmentCopy(),
    confinedLineOf: runsAsGiven,
    runLine:        recordedGateLines.runLine,
    childFolder:    RUN_FOLDER,
  }));

  expect(recordedGateLines.takeLineRequests().map((lineRequest) => lineRequest.directory)).toEqual([join(checkoutDirectory, 'packages/example'), join(checkoutDirectory, 'docs')]);
});

test('a gate\'s environment carries its own report path, drops an inherited one and the job variables, and keeps the rest', () => {
  const inherited = { [GATE_REPORT_VARIABLE]: '/example/inherited-report.json', [JOB_ID_VARIABLE]: 'J7', EXAMPLE_KEPT: 'kept' };

  expect([GateRun.gateEnvironmentOf(inherited, '/example/gate-report.json'), GateRun.gateEnvironmentOf(inherited)]).toEqual([
    { EXAMPLE_KEPT: 'kept', [GATE_REPORT_VARIABLE]: '/example/gate-report.json' },
    { EXAMPLE_KEPT: 'kept' },
  ]);
});

test('a line child step\'s report path is one per step folder, in the temporary folder, and a take reads it once and removes it', () => {
  const reportFile = GateRun.gateReportFileFor('/example/jobs/J2/gate-1');
  writeFileSync(reportFile, JSON.stringify({ version: 1, cache: 'hit' }));

  expect([
    dirname(reportFile) === tmpdir(),
    reportFile === GateRun.gateReportFileFor('/example/jobs/J2/gate-1'),
    reportFile === GateRun.gateReportFileFor('/example/jobs/J2/gate-2'),
  ]).toEqual([true, true, false]);
  expect([GateRun.takeCacheReport(reportFile), existsSync(reportFile), GateRun.takeCacheReport(reportFile)]).toEqual(['hit', false, null]);
});
