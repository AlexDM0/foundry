/**
 * The recorded gate lines give only what real gate lines gave: each ends as it really ended, read through the real `GateRun.runGate`; a write
 * outside the allowed folders under the recorded confinement ends red; and a line the recording does not hold fails the case, whichever part
 * is unknown, even though `runGate` catches the throw.
 */
import { describe, expect, test } from 'bun:test';

import { GateRun, type GateProcessRun } from '../services/lifecycle/GateRun.ts';
import { environmentCopy }              from '../shared/Environment.ts';
import { nativePlatformPorts }          from './NativePlatformPorts.ts';
import {
  RECORDED_GATE_LINES,
  recordedGateConfiner,
  useRecordedGateLines,
  writesOutsideLineOf
} from './RecordedGateLines.ts';

const { shellLine } = nativePlatformPorts();
const recordedLines = useRecordedGateLines();
const EXAMPLE_DIRECTORY = '/example/worktree';
const EXAMPLE_OUTSIDE_FOLDER = '/example/outside';
const STATUS_FILE = '/example/line-status';
const EXAMPLE_LINE_FOLDER = '/example/board/merge-gates/0123456789abcdef/gate-1';

function runOf(argv: readonly string[]): Promise<GateProcessRun> {
  return GateRun.runGate({
    argv, directory: EXAMPLE_DIRECTORY, environment: environmentCopy(), runLine: recordedLines.runLine, childFolder: EXAMPLE_LINE_FOLDER
  });
}

function shellArgvOf(line: string): readonly string[] {
  return shellLine.spawnRequestOf(line, STATUS_FILE).argv;
}

function confinedArgvOf(line: string): readonly string[] {
  const confined = recordedGateConfiner(shellArgvOf(line));
  if (confined.verdict === 'refused') throw new Error(confined.reason);
  return confined.argv;
}

describe('a recorded line ends as the real line ended', () => {
  test.each([
    ['unconfined', (line: string) => shellArgvOf(line)],
    ['confined', (line: string) => confinedArgvOf(line)],
  ])('%s: a green line passes, a red line fails with its output, and a stopped line cannot run', async (_confinement, argvOf) => {
    const green = await runOf(argvOf(RECORDED_GATE_LINES.GREEN));
    const red = await runOf(argvOf(RECORDED_GATE_LINES.RED));
    const stopped = await runOf(argvOf(RECORDED_GATE_LINES.STOPPED));

    expect(GateRun.gateOutcomeOf(shellLine, green)).toBe('passed');
    expect(GateRun.gateOutcomeOf(shellLine, red)).toBe('failed');
    expect(red.output).toBe('example-red\n');
    expect(stopped).toMatchObject({ exitCode: null, signalCode: 'SIGTERM' });
    expect(GateRun.gateOutcomeOf(shellLine, stopped)).toBe('cannot-run');
  });

  test('a confined line that writes outside the allowed folders ends red, the refusal naming the folder it wrote to', async () => {
    const run = await runOf(confinedArgvOf(writesOutsideLineOf(EXAMPLE_OUTSIDE_FOLDER)));

    expect(run.exitCode).not.toBe(0);
    expect(GateRun.gateOutcomeOf(shellLine, run)).toBe('failed');
    expect(run.output).toContain(`${EXAMPLE_OUTSIDE_FOLDER}/`);
  });
});

describe('a line with no recorded answer', () => {
  test.each([
    ['an unconfined write outside the allowed folders, which no sandbox refused', () => shellArgvOf(writesOutsideLineOf(EXAMPLE_OUTSIDE_FOLDER))],
    ['a line nobody recorded', () => shellArgvOf('bun test')],
    ['an argv the shell line never builds', () => ['/bin/sh', '-c', RECORDED_GATE_LINES.GREEN]],
    ['a recorded line under another confinement', () => ['/usr/bin/env', ...shellArgvOf(RECORDED_GATE_LINES.GREEN)]],
  ])('%s starts nothing, never passes and is kept for the case to fail on', async (_case, argvOf) => {
    const run = await runOf(argvOf());

    expect(run).toMatchObject({ exitCode: null, signalCode: null });
    expect(run.output).toContain('has no recorded answer');
    expect(GateRun.gateOutcomeOf(shellLine, run)).toBe('cannot-run');
    expect(recordedLines.takeUnansweredCalls()).toHaveLength(1);
  });
});
