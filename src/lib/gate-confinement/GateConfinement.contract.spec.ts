/**
 * One contract for the `GateConfinement` port: an adapter wraps the argv exactly when it answers `confined`, and every other answer hands the
 * argv back unchanged, since refusing to run is not this port's to decide. Seatbelt runs on a fake table, confined and not; a real child under
 * the native adapter is held by `src/services/overseer/ProcessWatcherSandbox.spec.ts`.
 */
import { expect, test } from 'bun:test';

import { type PortClause, runPortContract }                               from '../../testing/PortContract.ts';
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
  { name: 'a platform with no adapter', build: () => gateConfinementFor('win32') },
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

test('Linux answers unavailable and keeps today\'s pass-through, and so does a platform with no adapter', () => {
  expect(gateConfinementFor('win32').availability()).toMatchObject({ verdict: 'unavailable' });
  expect(seatbeltOf(false).availability()).toMatchObject({ verdict: 'unavailable', reason: expect.any(String) });
});
