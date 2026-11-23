/**
 * What matters: a default spec's ports answer the spec's own process and the machine's confinement from the recordings, never from the
 * real system, and a call no recording answers throws and is kept, so the case fails even where production code catches the throw. The
 * ports are one record for the run, so what a port keeps per record lasts across commands.
 */
import { describe, expect, test } from 'bun:test';

import { defaultSpecPlatformPorts, takeUnansweredDefaultPortCalls }        from './DefaultSpecPlatformPorts.ts';
import { CONFINEMENT_CALL_SHAPES, GATE_LINE_BOUNDARIES, recordedAnswerOf } from './RecordedGateLines.ts';
import { describeWhenRecorded }                                            from './ToolGuard.ts';

const UNBORN_PROCESS_ID = 4_999_999;
const EXAMPLE_PLAN = {
  worktree:            '/example/worktree',
  writableRoots:       [],
  worktreeAdminFolder: null,
  temporaryDirectory:  null,
  writableCachePaths:  [],
  deniedWritableRoots: [],
  deniedReadableRoots: [],
  network:             false,
  confinementFilePath: '/example/confinement-profile',
};

describe('the default spec ports', () => {
  test('are one record for the whole run', () => {
    expect(defaultSpecPlatformPorts()).toBe(defaultSpecPlatformPorts());
  });
});

describeWhenRecorded(['process-table-recording'], 'the process table of a default spec', () => {
  test('knows the spec\'s own process, as the recording answers it', () => {
    const identity = defaultSpecPlatformPorts().processSupervision.identityOf(process.pid);

    expect(identity?.processId).toBe(process.pid);
    expect(takeUnansweredDefaultPortCalls()).toEqual([]);
  });

  test('throws on a process it never bore, and keeps the call for the case to fail on', () => {
    expect(() => defaultSpecPlatformPorts().processSupervision.identityOf(UNBORN_PROCESS_ID)).toThrow('has no recorded answer');
    expect(takeUnansweredDefaultPortCalls()).toEqual([`identityOf(${UNBORN_PROCESS_ID}) has no recorded answer: process ${UNBORN_PROCESS_ID} was never born in this table`]);
  });
});

describeWhenRecorded(['gate-confinement-recording'], 'the gate confinement of a default spec', () => {
  test('answers the machine\'s availability and worker confinement as the recording holds them', () => {
    const { gateConfinement } = defaultSpecPlatformPorts();

    expect<unknown>(gateConfinement.availability()).toEqual(recordedAnswerOf(GATE_LINE_BOUNDARIES.GATE_CONFINEMENT, CONFINEMENT_CALL_SHAPES.AVAILABILITY));
    expect<unknown>(gateConfinement.workerConfinement()).toBe(recordedAnswerOf(GATE_LINE_BOUNDARIES.GATE_CONFINEMENT, CONFINEMENT_CALL_SHAPES.WORKER_CONFINEMENT));
  });

  test('confines no argv: the call throws and is kept for the case to fail on', () => {
    expect(() => defaultSpecPlatformPorts().gateConfinement.confinedArgvOf(EXAMPLE_PLAN, ['/bin/sh'])).toThrow('has no recorded answer');
    expect(takeUnansweredDefaultPortCalls()).toHaveLength(1);
  });
});
