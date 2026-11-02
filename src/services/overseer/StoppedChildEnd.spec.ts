/**
 * What a child's end on the Windows adapter decides downstream, read the way `DrivePass.ts` and `JobLaunch.ts` read a Watcher's end. A kill reads as
 * exit 1 there, so what matters is that a forced stop does not reach the branches of a child that exited by itself.
 */
import { expect, test } from 'bun:test';

import type { Job }                                        from '../../lib/tracker-model/@types/Job.ts';
import { createFakeWindowsKernel, fakeWindowsSupervision } from '../../testing/FakeWindowsKernel.ts';
import { nativePlatformPorts }                             from '../../testing/NativePlatformPorts.ts';
import { GateRun }                                         from '../lifecycle/GateRun.ts';
import { JobResumption }                                   from './JobResumption.ts';

const KILLED_EXIT_CODE = 1;
const RESUMED_JOB = { watcherInstance: 2 } as Readonly<Job>;

const { endOf } = fakeWindowsSupervision(createFakeWindowsKernel());
const { shellLine } = nativePlatformPorts();

test('a resumed session killed before it started reads interrupted rather than a failed resume; one that exited by itself is the failed resume', () => {
  const sessionStarted = false;
  const stopped = endOf({ exitCode: KILLED_EXIT_CODE, signalCode: null, forcedStopRan: true });
  const exited  = endOf({ exitCode: KILLED_EXIT_CODE, signalCode: null });
  expect(JobResumption.resumeFailed(RESUMED_JOB, stopped.reason === 'exited', sessionStarted)).toBe(false);
  expect(JobResumption.resumeFailed(RESUMED_JOB, exited.reason === 'exited', sessionStarted)).toBe(true);
});

test('a stopped gate reads cannot-run; a gate that exited 1 by itself reads failed', () => {
  const gateRunOf = (forcedStopRan: boolean) => {
    const end = endOf({ exitCode: KILLED_EXIT_CODE, signalCode: null, forcedStopRan });
    return {
      exitCode: end.reason === 'exited' ? end.exitCode : null, signalCode: end.signal, recordedStatus: null, output: ''
    };
  };
  expect(GateRun.gateOutcomeOf(shellLine, gateRunOf(true))).toBe('cannot-run');
  expect(GateRun.gateOutcomeOf(shellLine, gateRunOf(false))).toBe('failed');
});
