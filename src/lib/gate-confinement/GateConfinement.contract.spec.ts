/**
 * One contract for the `GateConfinement` port: an adapter wraps the argv exactly when it answers `confined`, and every other answer hands the
 * argv back unchanged, since refusing to run is not this port's to decide. Seatbelt runs on a fake table, confined and not; a real child under
 * the native adapter is held by `src/services/overseer/ProcessWatcherSandbox.spec.ts`.
 */
import { describe, expect, test } from 'bun:test';

import { type PortClause, runPortContract }                               from '../../testing/PortContract.ts';
import { confinedLineOf }                                                 from './ConfinedLine.ts';
import { createDarwinSeatbelt, seatbeltProfileTextOf, SANDBOX_EXEC_PATH } from './DarwinSeatbelt.ts';
import type { ConfinementPlan, GateConfinement }                          from './GateConfinement.ts';
import { gateConfinementFor }                                             from './GateConfinementFor.ts';

const PLAN: ConfinementPlan = {
  worktree:            '/private/tmp/example-worktree',
  worktreeAdminFolder: null,
  temporaryDirectory:  null,
  writableCachePaths:  [],
  deniedWritableRoots: ['/private/tmp/example-data'],
  deniedReadableRoots: ['/private/tmp/example-secrets'],
  network:             false,
  confinementFilePath: '/private/tmp/example-job/process-sandbox.sb',
};
const ARGV = ['/bin/sh', '-c', 'true'];

function seatbeltOf(applies: boolean, written: Map<string, string> = new Map()): GateConfinement {
  return createDarwinSeatbelt({
    fileExists:      () => true,
    programSucceeds: () => applies,
    writeFile:       (path, text) => written.set(path, text),
  });
}

const CLAUSES: readonly PortClause<GateConfinement>[] = [{
  claim: 'wraps the argv when it answers confined, and hands it back unchanged otherwise',
  check: (confinement) => {
    const confinedArgv = confinement.confinedArgvOf(PLAN, ARGV);
    if (confinement.availability().verdict === 'confined') expect(confinedArgv.slice(-ARGV.length)).toEqual(ARGV);
    else expect(confinedArgv).toEqual(ARGV);
    if (confinement.availability().verdict === 'confined') expect(confinedArgv.length).toBeGreaterThan(ARGV.length);
  },
}];

runPortContract('GateConfinement', [
  { name: 'DarwinSeatbelt where sandbox-exec applies', build: () => seatbeltOf(true) },
  { name: 'DarwinSeatbelt where sandbox-exec cannot apply', build: () => seatbeltOf(false) },
  { name: 'WindowsNoConfinement', build: () => gateConfinementFor('win32') },
  { name: 'a platform with no adapter', build: () => gateConfinementFor('freebsd') },
], CLAUSES);

test('a confined argv runs sandbox-exec on the profile the adapter wrote from the plan', () => {
  const written = new Map<string, string>();
  expect(seatbeltOf(true, written).confinedArgvOf(PLAN, ARGV)).toEqual([SANDBOX_EXEC_PATH, '-f', PLAN.confinementFilePath, ...ARGV]);
  expect(written.get(PLAN.confinementFilePath)).toBe(seatbeltProfileTextOf(PLAN));
});

test('sandbox-exec is probed once, and a missing one is never run', () => {
  let probes = 0;
  const seatbelt = createDarwinSeatbelt({
    fileExists:      () => false,
    programSucceeds: () => {
      probes += 1;
      return true;
    },
    writeFile: () => undefined,
  });
  expect(seatbelt.availability().verdict).toBe('unavailable');
  expect(probes).toBe(0);
  let applyingProbes = 0;
  const applying = createDarwinSeatbelt({
    fileExists:      () => true,
    programSucceeds: () => {
      applyingProbes += 1;
      return true;
    },
    writeFile: () => undefined,
  });
  applying.availability();
  applying.confinedArgvOf(PLAN, ARGV);
  expect(applyingProbes).toBe(1);
});

test('a platform with no adapter and Seatbelt that cannot apply answer unavailable with a reason', () => {
  expect(gateConfinementFor('freebsd').availability()).toMatchObject({ verdict: 'unavailable', reason: expect.any(String) });
  expect(seatbeltOf(false).availability()).toMatchObject({ verdict: 'unavailable', reason: expect.any(String) });
});

test('Windows answers unconfined-by-design for gates and workers, and writes no confinement file', () => {
  const windows = gateConfinementFor('win32');
  expect(windows.availability()).toEqual({ verdict: 'unconfined-by-design' });
  expect(windows.workerConfinement()).toBe('unconfined-by-design');
  expect(windows.confinedArgvOf(PLAN, ARGV)).toEqual(ARGV);
});

test('a worker is confined under Seatbelt whatever the gate probe answers, since its launch demands its own sandbox', () => {
  expect([seatbeltOf(true).workerConfinement(), seatbeltOf(false).workerConfinement()]).toEqual(['confined', 'confined']);
  expect(gateConfinementFor('freebsd').workerConfinement()).toBe('unavailable');
});

describe('confinedLineOf, the only way to a line', () => {
  test('refuses on unavailable, never asking the adapter for the argv it would hand back unchanged', () => {
    const written = new Map<string, string>();
    expect(confinedLineOf(seatbeltOf(false, written), () => PLAN, ARGV)).toEqual({ verdict: 'refused', reason: 'sandbox-exec cannot apply a profile here' });
    expect(written.size).toBe(0);
  });

  test('runs the wrapped argv when confined, and the argv unchanged when unconfined by design', () => {
    expect(confinedLineOf(seatbeltOf(true), () => PLAN, ARGV)).toEqual({ verdict: 'runs', argv: [SANDBOX_EXEC_PATH, '-f', PLAN.confinementFilePath, ...ARGV] });
    expect(confinedLineOf(gateConfinementFor('win32'), () => PLAN, ARGV)).toEqual({ verdict: 'runs', argv: ARGV });
  });
});
