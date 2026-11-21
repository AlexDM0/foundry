/**
 * The machine-wide cap on gate runs. What matters: with the cap at 2 a third gate run waits until one of the two ends; a holder asking
 * again keeps the slot it holds rather than taking a second; a slot whose holder is no longer live is taken over without a release; and
 * the slots are files, so two Hephaestus processes sharing the folder share the cap. A gate line with no child record is judged by the process
 * recorded with its slot, the acquirer's until the launch is recorded, and one whose job folder is gone frees its slot: else a launch that
 * never came up would hold a slot for good.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { PlatformPorts }                             from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                           from '../../lib/process-identity/ProcessIdentity.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                         from '../../testing/TalosChildReadings.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { GateRunSlots }                                   from './GateRunSlots.ts';


/** The holder's liveness as the drive pass judges it, a gate line's read through Talos's adapter of the board's children. */
function holderIsLive(ports: PlatformPorts, holding: Parameters<typeof GateRunSlots.gateRunHolderIsLive>[2]): boolean {
  return GateRunSlots.gateRunHolderIsLive(talosChildReadingsWith(ports, '/example/tracker'), ports, holding);
}

const ports = nativePlatformPorts();
const { identityOf } = ports.processSupervision;

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

const RETRY_MILLISECONDS = 5;
const SLOT_LIMIT = 2;
const RETRIES_WATCHED = 3;

function slotsIn(folder: string, liveHolders: Pick<Set<string>, 'has'>): GateRunSlots {
  return GateRunSlots.createGateRunSlots({
    ports, folder, limit: SLOT_LIMIT, holderIsLive: (holding) => liveHolders.has(holding.holder), retryMilliseconds: RETRY_MILLISECONDS,
  });
}

function childJudgedSlotsIn(folder: string): GateRunSlots {
  return GateRunSlots.createGateRunSlots({
    ports, folder, limit: 2, holderIsLive: (holding) => holderIsLive(ports, holding), retryMilliseconds: RETRY_MILLISECONDS,
  });
}

function scratchFolder(): string {
  const folder = createScratchDirectory('gate-slots');
  scratchDirectories.push(folder);
  return folder;
}

describe('the gate run slots', () => {
  test('with the cap at 2 and three gate runs due, the third waits until one ends', async () => {
    let holderJudgments = 0;
    const slots = slotsIn(scratchFolder(), {
      has: () => {
        holderJudgments += 1;
        return true;
      },
    });
    const releaseFirst = await slots.acquire('first');
    await slots.acquire('second');
    let thirdStarted = false;

    const third = slots.acquire('third').then(() => {
      thirdStarted = true;
    });
    await waitUntil(() => holderJudgments >= SLOT_LIMIT * RETRIES_WATCHED, 'the third run retrying the full slots');
    expect(thirdStarted).toBe(false);

    releaseFirst();
    await third;
    expect(thirdStarted).toBe(true);
  });

  test('two Hephaestus processes sharing the folder share the cap', () => {
    const folder = scratchFolder();
    const liveHolders = new Set(['hephaestus-one', 'hephaestus-two', 'hephaestus-three']);

    expect(slotsIn(folder, liveHolders).tryAcquire('hephaestus-one')).toBe(true);
    expect(slotsIn(folder, liveHolders).tryAcquire('hephaestus-two')).toBe(true);
    expect(slotsIn(folder, liveHolders).tryAcquire('hephaestus-three')).toBe(false);
  });

  test('a holder asking again keeps its one slot', () => {
    const slots = slotsIn(scratchFolder(), new Set(['child-a', 'child-b']));

    expect(slots.tryAcquire('child-a')).toBe(true);
    expect(slots.tryAcquire('child-a')).toBe(true);
    expect(slots.tryAcquire('child-b')).toBe(true);
  });

  test('a slot whose holder ended is taken over without a release', () => {
    const liveHolders = new Set(['ended-child', 'live-child', 'waiting-child']);
    const slots = slotsIn(scratchFolder(), liveHolders);
    slots.tryAcquire('ended-child');
    slots.tryAcquire('live-child');
    expect(slots.tryAcquire('waiting-child')).toBe(false);

    liveHolders.delete('ended-child');

    expect(slots.tryAcquire('waiting-child')).toBe(true);
  });
});

describe('a gate line with no child record', () => {
  function gateChildFolderIn(scratch: string, jobId: string): string {
    const jobFolder = join(scratch, 'jobs', jobId);
    mkdirSync(jobFolder, { recursive: true });
    return join(jobFolder, 'gate-1');
  }

  function sleeperIdentity(): { identity: ProcessIdentity; stop: () => Promise<void> } {
    const sleeper = Bun.spawn(['sleep', '30'], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
    const identity = identityOf(sleeper.pid);
    if (identity === null) throw new Error('the sleeper has no readable identity');
    return {
      identity,
      stop: async () => {
        sleeper.kill();
        await sleeper.exited;
      },
    };
  }

  /** Both slots taken by never-claimed gate children answered for by `firstProcess` and `secondProcess`. */
  function fullSlots(scratch: string, firstProcess: ProcessIdentity | null, secondProcess: ProcessIdentity | null): { slots: GateRunSlots; first: string; second: string } {
    const slots = childJudgedSlotsIn(join(scratch, 'slots'));
    const first = gateChildFolderIn(scratch, 'first-job');
    const second = gateChildFolderIn(scratch, 'second-job');
    expect(slots.tryAcquire(first)).toBe(true);
    expect(slots.tryAcquire(second)).toBe(true);
    slots.recordSpawnedProcess(first, firstProcess);
    slots.recordSpawnedProcess(second, secondProcess);
    return { slots, first, second };
  }

  test('frees its slot once its spawned process is gone', async () => {
    const scratch = scratchFolder();
    const spawned = sleeperIdentity();
    const { slots } = fullSlots(scratch, spawned.identity, identityOf(process.pid));

    await spawned.stop();

    expect(slots.tryAcquire(gateChildFolderIn(scratch, 'waiting-job'))).toBe(true);
  });

  test('frees its slot once its job folder is gone, its recorded process still running', async () => {
    const scratch = scratchFolder();
    const { slots } = fullSlots(scratch, identityOf(process.pid), identityOf(process.pid));

    removeScratchDirectory(join(scratch, 'jobs', 'first-job'));

    expect(slots.tryAcquire(gateChildFolderIn(scratch, 'waiting-job'))).toBe(true);
  });

  test('keeps its slot while its spawned process runs', async () => {
    const scratch = scratchFolder();
    const spawned = sleeperIdentity();
    try {
      const { slots } = fullSlots(scratch, spawned.identity, identityOf(process.pid));

      expect(slots.tryAcquire(gateChildFolderIn(scratch, 'waiting-job'))).toBe(false);
    } finally {
      await spawned.stop();
    }
  });

  test('keeps its slot between the acquire and the recorded spawn, answered for by the acquiring process', () => {
    const scratch = scratchFolder();
    const slots = childJudgedSlotsIn(join(scratch, 'slots'));
    expect(slots.tryAcquire(gateChildFolderIn(scratch, 'first-job'))).toBe(true);
    expect(slots.tryAcquire(gateChildFolderIn(scratch, 'second-job'))).toBe(true);

    expect(slots.tryAcquire(gateChildFolderIn(scratch, 'waiting-job'))).toBe(false);
  });

  test('frees its slot when its spawn left no process', () => {
    const scratch = scratchFolder();
    const { slots } = fullSlots(scratch, null, identityOf(process.pid));

    expect(slots.tryAcquire(gateChildFolderIn(scratch, 'waiting-job'))).toBe(true);
  });
});
