/**
 * Gaia's own update over the recorded checkout and relaunch: what a check, an update and a restart leave in the status, that a failure
 * names its step and a fast-forwarded clone still waits for its restart, that the hourly check passes over an update on its way or done,
 * and that a Gaia no Gaia.app started cannot restart.
 */
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import { createGaiaCheckout }                                                         from '../../adapters/gaia-checkout/GaiaCheckout.ts';
import { EXAMPLE_BUN_PROGRAM, recordedGaiaCheckoutRunOf, type GaiaCheckoutSituation } from '../../adapters/gaia-checkout/testing/RecordedGaiaCheckout.ts';
import type { ProcessRun }                                                            from '../../lib/process-run/ProcessRun.ts';
import { repositoryRoot }                                                             from '../../testing/BoundaryRecordings.ts';
import { manualTimers, type ManualTimers }                                            from '../../testing/ManualTimers.ts';
import {
  createGaiaUpdate,
  type GaiaRelaunchTarget,
  type GaiaUpdate,
  isGaiaUpdateCommand
} from './GaiaUpdate.ts';
import { EXAMPLE_RELAUNCH_TARGET, recordedGaiaRelaunchRun } from './testing/RecordedGaiaRelaunch.ts';

const CHECK_INTERVAL_MILLISECONDS = 1_000;

/** The recorded runs need a clone's folders to exist, as real runs do: this repository's are the ones at hand. */
function monorepoRoot(): string {
  return join(repositoryRoot(), '..', '..');
}

interface UpdateUnderTest {
  readonly gaiaUpdate:    GaiaUpdate;
  readonly timers:        ManualTimers;
  readonly relaunchRun:   ProcessRun;
  readonly statusChanges: () => number;
}

function updateOver(situation: GaiaCheckoutSituation, relaunchTarget: GaiaRelaunchTarget | null = EXAMPLE_RELAUNCH_TARGET): UpdateUnderTest {
  const timers = manualTimers();
  const relaunchRun = recordedGaiaRelaunchRun();
  let statusChanges = 0;
  const gaiaUpdate = createGaiaUpdate({
    checkout:         createGaiaCheckout({ processRun: recordedGaiaCheckoutRunOf(situation), checkoutFolder: monorepoRoot(), bunProgram: EXAMPLE_BUN_PROGRAM }),
    processRun:       relaunchRun,
    relaunchTarget,
    workingDirectory: monorepoRoot(),
    timers,
    onStatusChanged:  () => {
      statusChanges += 1;
    },
    checkIntervalMilliseconds: CHECK_INTERVAL_MILLISECONDS,
  });
  return {
    gaiaUpdate, timers, relaunchRun, statusChanges: () => statusChanges
  };
}

async function startedAndChecked(underTest: UpdateUnderTest): Promise<void> {
  underTest.gaiaUpdate.start();
  await underTest.gaiaUpdate.untilSettled();
}

describe('the check', () => {
  test('starts as checking, and reads a clone at origin\'s main as up to date', async () => {
    const underTest = updateOver('up-to-date');
    expect(underTest.gaiaUpdate.status().state).toBe('checking');
    await startedAndChecked(underTest);
    expect(underTest.gaiaUpdate.status()).toEqual({
      state: 'up-to-date', commitsBehind: 0, failure: null, restartIsPossible: true
    });
    expect(underTest.statusChanges()).toBeGreaterThan(0);
    underTest.gaiaUpdate.stop();
  });

  test('reads a clone behind origin as an update with the commits it lacks', async () => {
    const underTest = updateOver('behind');
    await startedAndChecked(underTest);
    const { state, commitsBehind, failure } = underTest.gaiaUpdate.status();
    expect([state, commitsBehind > 0, failure]).toEqual(['available', true, null]);
    underTest.gaiaUpdate.stop();
  });

  test('names an unreachable origin and a folder that is no clone, and offers to check again', async () => {
    for (const situation of ['origin-unreachable', 'not-a-clone'] as const) {
      const underTest = updateOver(situation);
      await startedAndChecked(underTest);
      expect([underTest.gaiaUpdate.status().state, underTest.gaiaUpdate.status().failure]).toEqual(['not-known', situation]);
      underTest.gaiaUpdate.stop();
    }
  });

  test('checks again every interval, and the stop leaves no timer pending', async () => {
    const underTest = updateOver('up-to-date');
    await startedAndChecked(underTest);
    expect(underTest.timers.pendingDelays()).toEqual([CHECK_INTERVAL_MILLISECONDS]);
    const changesBefore = underTest.statusChanges();
    underTest.timers.fire(CHECK_INTERVAL_MILLISECONDS);
    await underTest.gaiaUpdate.untilSettled();
    expect(underTest.statusChanges()).toBeGreaterThan(changesBefore);
    underTest.gaiaUpdate.stop();
    expect(underTest.timers.pendingDelays()).toEqual([]);
  });

  test('a press of Up to date checks again and answers once the check has ended', async () => {
    const underTest = updateOver('up-to-date');
    await startedAndChecked(underTest);
    expect(await underTest.gaiaUpdate.carry({ kind: 'gaia-update-check' })).toEqual({ verdict: 'done' });
    expect(underTest.gaiaUpdate.status().state).toBe('up-to-date');
    underTest.gaiaUpdate.stop();
  });
});

describe('the update', () => {
  test('fast-forwards the clone, runs forge\'s setup and then waits for the restart', async () => {
    const underTest = updateOver('behind');
    await startedAndChecked(underTest);
    expect(await underTest.gaiaUpdate.carry({ kind: 'gaia-update' })).toEqual({ verdict: 'done' });
    expect(underTest.gaiaUpdate.status().state).toBe('updating');
    await underTest.gaiaUpdate.untilSettled();
    expect(underTest.gaiaUpdate.status()).toEqual({
      state: 'restart-needed', commitsBehind: 0, failure: null, restartIsPossible: true
    });
    underTest.gaiaUpdate.stop();
  });

  test('a setup that did not finish still waits for the restart, with the failure beside it', async () => {
    const underTest = updateOver('setup-fails');
    await startedAndChecked(underTest);
    await underTest.gaiaUpdate.carry({ kind: 'gaia-update' });
    await underTest.gaiaUpdate.untilSettled();
    expect([underTest.gaiaUpdate.status().state, underTest.gaiaUpdate.status().failure]).toEqual(['restart-needed', 'forge-setup-failed']);
    underTest.gaiaUpdate.stop();
  });

  test('leaves a clone with local changes or commits of its own as it is, and still offers the update', async () => {
    for (const situation of ['local-changes', 'diverged'] as const) {
      const underTest = updateOver(situation);
      await startedAndChecked(underTest);
      await underTest.gaiaUpdate.carry({ kind: 'gaia-update' });
      await underTest.gaiaUpdate.untilSettled();
      expect([underTest.gaiaUpdate.status().state, underTest.gaiaUpdate.status().failure]).toEqual(['available', situation]);
      underTest.gaiaUpdate.stop();
    }
  });

  test('has nothing to do while Gaia is up to date, and the hourly check passes over an update waiting for its restart', async () => {
    const upToDate = updateOver('up-to-date');
    await startedAndChecked(upToDate);
    expect(await upToDate.gaiaUpdate.carry({ kind: 'gaia-update' })).toEqual({ verdict: 'nothing-to-do' });
    upToDate.gaiaUpdate.stop();

    const updated = updateOver('behind');
    await startedAndChecked(updated);
    await updated.gaiaUpdate.carry({ kind: 'gaia-update' });
    await updated.gaiaUpdate.untilSettled();
    updated.timers.fire(CHECK_INTERVAL_MILLISECONDS);
    await updated.gaiaUpdate.untilSettled();
    expect(updated.gaiaUpdate.status().state).toBe('restart-needed');
    expect(await updated.gaiaUpdate.carry({ kind: 'gaia-update-check' })).toEqual({ verdict: 'nothing-to-do' });
    updated.gaiaUpdate.stop();
  });
});

describe('the restart', () => {
  test('starts the relaunch of the Gaia.app that started this server, and then shows Gaia restarting', async () => {
    const underTest = updateOver('behind');
    await startedAndChecked(underTest);
    await underTest.gaiaUpdate.carry({ kind: 'gaia-update' });
    await underTest.gaiaUpdate.untilSettled();
    expect(await underTest.gaiaUpdate.carry({ kind: 'gaia-restart' })).toEqual({ verdict: 'done' });
    expect(underTest.gaiaUpdate.status().state).toBe('restarting');
    underTest.gaiaUpdate.stop();
  });

  test('has nothing to do before an update, and a Gaia no Gaia.app started cannot restart', async () => {
    const beforeUpdate = updateOver('behind');
    await startedAndChecked(beforeUpdate);
    expect(await beforeUpdate.gaiaUpdate.carry({ kind: 'gaia-restart' })).toEqual({ verdict: 'nothing-to-do' });
    beforeUpdate.gaiaUpdate.stop();

    const fromATerminal = updateOver('behind', null);
    await startedAndChecked(fromATerminal);
    expect(fromATerminal.gaiaUpdate.status().restartIsPossible).toBe(false);
    await fromATerminal.gaiaUpdate.carry({ kind: 'gaia-update' });
    await fromATerminal.gaiaUpdate.untilSettled();
    expect(await fromATerminal.gaiaUpdate.carry({ kind: 'gaia-restart' })).toEqual({ verdict: 'not-supported' });
    expect(fromATerminal.gaiaUpdate.status().state).toBe('restart-needed');
    fromATerminal.gaiaUpdate.stop();
  });
});

describe('the reboot', () => {
  test('relaunches Gaia while it is up to date, with no update behind it', async () => {
    const underTest = updateOver('up-to-date');
    await startedAndChecked(underTest);
    expect(await underTest.gaiaUpdate.carry({ kind: 'gaia-reboot' })).toEqual({ verdict: 'done' });
    expect(underTest.gaiaUpdate.status().state).toBe('restarting');
    underTest.gaiaUpdate.stop();
  });

  test('waits while an update is on its way, and a Gaia no Gaia.app started cannot reboot', async () => {
    const updating = updateOver('behind');
    await startedAndChecked(updating);
    await updating.gaiaUpdate.carry({ kind: 'gaia-update' });
    expect(await updating.gaiaUpdate.carry({ kind: 'gaia-reboot' })).toEqual({ verdict: 'nothing-to-do' });
    await updating.gaiaUpdate.untilSettled();
    updating.gaiaUpdate.stop();

    const fromATerminal = updateOver('up-to-date', null);
    await startedAndChecked(fromATerminal);
    expect(await fromATerminal.gaiaUpdate.carry({ kind: 'gaia-reboot' })).toEqual({ verdict: 'not-supported' });
    expect(fromATerminal.gaiaUpdate.status().state).toBe('up-to-date');
    fromATerminal.gaiaUpdate.stop();
  });
});

describe('the update commands', () => {
  test('are told apart from every forge and fleet command', () => {
    expect([
      isGaiaUpdateCommand({ kind: 'gaia-update-check' }),
      isGaiaUpdateCommand({ kind: 'gaia-update' }),
      isGaiaUpdateCommand({ kind: 'gaia-restart' }),
      isGaiaUpdateCommand({ kind: 'gaia-reboot' }),
      isGaiaUpdateCommand({ kind: 'fleet-look-again' }),
      isGaiaUpdateCommand({ kind: 'forge-update', trackerId: 'example-storefront' }),
    ]).toEqual([true, true, true, true, false, false]);
  });
});
