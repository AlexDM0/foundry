/**
 * A gate slot on Windows, over a fake kernel table. What matters: a gate line launched with no child record yet answers for its slot through
 * the recorded process, so another acquirer waits while that process lives and takes the slot once it is gone. Every holder is a child
 * folder: a line's folder is live while its child is and free once it ended or is lost, and a run's folder, whose lines run in step folders
 * below it, is live while one of them is. And over injected file moves: a held-file failure on a slot create is a taken slot on win32 and a
 * fault elsewhere, and a held move aside leaves a stale slot in place. A gate profile comes after every real gate: it takes no slot while a
 * real gate refused this round, or one waiting in this process, still has none. A wait whose stop signal aborts ends at once, holding no
 * slot and holding no profile back.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join }                          from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { FileReplace }                                from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceFor }                                  from '../../lib/atomic-file/FileReplaceFor.ts';
import type { PlatformPorts }                              from '../../lib/platform-ports/PlatformPortsFor.ts';
import { createFakeWindowsKernel, fakeWindowsSupervision } from '../../testing/FakeWindowsKernel.ts';
import { nativePlatformPorts }                             from '../../testing/NativePlatformPorts.ts';
import { PlantedChild }                                    from '../../testing/PlantedChild.ts';
import { createScratchDirectory, removeScratchDirectory }  from '../../testing/ScratchWorkspace.ts';
import { EVERY_TALOS_IS_LIVE, talosChildReadingsWith }     from '../../testing/TalosChildReadings.ts';
import { GateRunSlots, GateSlotWaitStoppedError }          from './GateRunSlots.ts';
import { heldSlotCreateMeansTakenFor }                     from './HeldSlotCreateFor.ts';


/** The holder's liveness as the drive pass judges it, a gate line's read through Talos's adapter of the board's children. */
function holderIsLive(ports: PlatformPorts, holding: Parameters<typeof GateRunSlots.gateRunHolderIsLive>[2]): boolean {
  return GateRunSlots.gateRunHolderIsLive(talosChildReadingsWith(ports, '/example/tracker'), ports, holding);
}

const HOLDER_PROCESS_ID = 5001;
const CREATION_TIME = 134_000_000_000_000_001n;

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function slotsOver(ports: PlatformPorts, folder: string): ReturnType<typeof GateRunSlots.createGateRunSlots> {
  return GateRunSlots.createGateRunSlots({
    ports, folder, limit: 1, holderIsLive: (holding) => holderIsLive(ports, holding), retryMilliseconds: 1,
  });
}

describe('a gate slot held by a spawned, unclaimed holder on Windows', () => {
  function heldSlot() {
    const kernel = createFakeWindowsKernel();
    kernel.table.set(process.pid, { creationTime: CREATION_TIME });
    kernel.table.set(HOLDER_PROCESS_ID, { creationTime: CREATION_TIME });
    const supervision = fakeWindowsSupervision(kernel);
    const ports: PlatformPorts = { ...nativePlatformPorts(), processSupervision: supervision };
    const scratch = createScratchDirectory('windows-gate-slots');
    scratchDirectories.push(scratch);
    const holder = join(scratch, 'job', 'gate-child');
    mkdirSync(holder, { recursive: true });
    const slots = slotsOver(ports, join(scratch, 'slots'));
    expect(slots.tryAcquire(holder)).toBe(true);
    slots.recordSpawnedProcess(holder, supervision.identityOf(HOLDER_PROCESS_ID));
    return { kernel, slots };
  }

  test('is not taken by another acquirer while that process lives', () => {
    const { slots } = heldSlot();
    expect(slots.tryAcquire('another-holder')).toBe(false);
  });

  test('is taken once that process is gone', () => {
    const { kernel, slots } = heldSlot();
    kernel.table.delete(HOLDER_PROCESS_ID);
    expect(slots.tryAcquire('another-holder')).toBe(true);
  });

  test('is taken once its process id was reused', () => {
    const { kernel, slots } = heldSlot();
    kernel.table.set(HOLDER_PROCESS_ID, { creationTime: CREATION_TIME + 1n });
    expect(slots.tryAcquire('another-holder')).toBe(true);
  });
});

describe('a gate slot held by a child folder', () => {
  /** A board whose children are read with every Talos live, so a child's own record alone says whether it is live. */
  function boardWithChildren() {
    const boardFolder = createScratchDirectory('child-folder-holders');
    scratchDirectories.push(boardFolder);
    const ports = nativePlatformPorts();
    const children = talosChildReadingsWith(ports, boardFolder, EVERY_TALOS_IS_LIVE);
    const runFolder = join(boardFolder, 'merge-gates', '0123456789abcdef');
    const isLive = (holder: string): boolean => GateRunSlots.gateRunHolderIsLive(children, ports, { holder, process: null });
    const plantLine = (stepFolder: string, changes: Parameters<typeof PlantedChild.plantChildRecord>[1]): void => {
      PlantedChild.plantChildRecord({ boardFolder, childFolder: `merge-gates/0123456789abcdef/${stepFolder}`, instance: 1 }, { kind: 'line', ...changes });
    };
    return { runFolder, isLive, plantLine };
  }

  test('a line\'s folder is live while its child runs, and free once it ended or is lost', () => {
    const { runFolder, isLive, plantLine } = boardWithChildren();
    plantLine('gate-1', {});
    plantLine('gate-2', {
      state: 'ended',
      end:   {
        reason: 'exited', exitCode: 0, signal: null, detail: null, runMilliseconds: 0
      }
    });
    plantLine('gate-3', { state: 'ended' });

    expect([isLive(join(runFolder, 'gate-1')), isLive(join(runFolder, 'gate-2')), isLive(join(runFolder, 'gate-3'))]).toEqual([true, false, false]);
  });

  test('a run\'s folder is live while a line below it runs, and free once none does and no acquirer answers for it', () => {
    const { runFolder, isLive, plantLine } = boardWithChildren();
    plantLine('prepare-1', {});
    const whileItRuns = isLive(runFolder);
    plantLine('prepare-1', {
      state: 'ended',
      end:   {
        reason: 'exited', exitCode: 0, signal: null, detail: null, runMilliseconds: 0
      }
    });

    expect([whileItRuns, isLive(runFolder)]).toEqual([true, false]);
  });
});

describe('a slot file that the platform refuses to create or move', () => {
  const POSIX_MOVES = fileReplaceFor('darwin');

  function failureWithCode(code: string): Error {
    return Object.assign(new Error(`example ${code} failure`), { code });
  }

  function slotsWithMoves(fileReplace: FileReplace, platform: string, holderIsLive: () => boolean = () => true) {
    const scratch = createScratchDirectory('refused-gate-slots');
    scratchDirectories.push(scratch);
    const folder = join(scratch, 'slots');
    const slots = GateRunSlots.createGateRunSlots({
      ports: nativePlatformPorts(), folder, limit: 1, holderIsLive, retryMilliseconds: 1, fileReplace, heldCreateMeansTaken: heldSlotCreateMeansTakenFor(platform),
    });
    return { slots, slotPath: join(folder, 'slot-1') };
  }

  test.each(['EPERM', 'EACCES', 'EBUSY'])('on win32, a create failing %s reads as a taken slot and throws nothing', (code) => {
    const refusingCreate: FileReplace = { ...POSIX_MOVES, createExclusively: () => { throw failureWithCode(code); } };
    const { slots } = slotsWithMoves(refusingCreate, 'win32');
    expect(slots.tryAcquire('example-holder')).toBe(false);
  });

  test('on POSIX, a create failing EACCES is a permission fault and still throws', () => {
    const refusingCreate: FileReplace = { ...POSIX_MOVES, createExclusively: () => { throw failureWithCode('EACCES'); } };
    const { slots } = slotsWithMoves(refusingCreate, 'linux');
    expect(() => slots.tryAcquire('example-holder')).toThrow('example EACCES failure');
  });

  test('a stale slot whose move aside answers held stays in place, and nothing throws', () => {
    const movedAside: string[] = [];
    const heldMove: FileReplace = {
      ...POSIX_MOVES,
      replaceFile: (fromPath) => {
        movedAside.push(fromPath);
        return { verdict: 'held', failure: failureWithCode('EBUSY') };
      },
    };
    const { slots, slotPath } = slotsWithMoves(heldMove, 'win32', () => false);
    mkdirSync(dirname(slotPath), { recursive: true });
    writeFileSync(slotPath, 'example-dead-holder');

    expect(slots.tryAcquire('example-holder')).toBe(false);

    expect(movedAside).toEqual([slotPath]);
    expect(readFileSync(slotPath, 'utf8')).toBe('example-dead-holder');
  });

  test('a stale slot whose move aside succeeds is taken over through the same moves', () => {
    const { slots, slotPath } = slotsWithMoves(POSIX_MOVES, 'win32', () => false);
    mkdirSync(dirname(slotPath), { recursive: true });
    writeFileSync(slotPath, 'example-dead-holder');

    expect(slots.tryAcquire('example-holder')).toBe(true);
    expect(readFileSync(slotPath, 'utf8').split('\n')[0]).toBe('example-holder');
  });
});

describe('a gate profile after the real gates', () => {
  function inProcessSlots(limit: number): ReturnType<typeof GateRunSlots.createGateRunSlots> {
    const ports = nativePlatformPorts();
    const scratch = createScratchDirectory('profile-gate-slots');
    scratchDirectories.push(scratch);
    return GateRunSlots.createGateRunSlots({
      ports, folder: join(scratch, 'slots'), limit, holderIsLive: () => true, retryMilliseconds: 1,
    });
  }

  test('takes no slot freed while a real gate refused this round still waits, and takes one once that gate took its own', () => {
    const slots = inProcessSlots(1);
    expect(slots.tryAcquire('real-gate-one')).toBe(true);
    expect(slots.tryAcquire('real-gate-two')).toBe(false);
    slots.release('real-gate-one');

    expect(slots.tryAcquireAfterRealGates('gate-profile')).toBe(false);
    expect(slots.tryAcquire('real-gate-two')).toBe(true);
    slots.release('real-gate-two');
    expect(slots.tryAcquireAfterRealGates('gate-profile')).toBe(true);
  });

  test('a real gate refused in an earlier round and not tried again waits no longer', () => {
    const slots = inProcessSlots(1);
    slots.tryAcquire('real-gate-one');
    slots.tryAcquire('real-gate-of-an-ended-job');
    slots.release('real-gate-one');

    slots.startRound();

    expect(slots.tryAcquireAfterRealGates('gate-profile')).toBe(true);
  });

  test('a refused profile counts as no waiting gate, so the next profile still gets a free slot', () => {
    const slots = inProcessSlots(2);
    expect(slots.tryAcquireAfterRealGates('first-profile')).toBe(true);
    expect(slots.tryAcquireAfterRealGates('second-profile')).toBe(true);
    expect(slots.tryAcquireAfterRealGates('third-profile')).toBe(false);
    slots.release('first-profile');

    expect(slots.tryAcquireAfterRealGates('third-profile')).toBe(true);
  });

  test('a stopped wait for a slot ends at once, holding no slot and holding no gate profile back', async () => {
    const ports = nativePlatformPorts();
    const scratch = createScratchDirectory('stopped-gate-slot-wait');
    scratchDirectories.push(scratch);
    const slowRetryMilliseconds = 60_000;
    const slots = GateRunSlots.createGateRunSlots({
      ports, folder: join(scratch, 'slots'), limit: 1, holderIsLive: () => true, retryMilliseconds: slowRetryMilliseconds,
    });
    slots.tryAcquire('other-forge-gate');
    const stopController = new AbortController();
    const waiting = slots.acquire('merge-gate', stopController.signal);
    stopController.abort();

    await expect(waiting).rejects.toBeInstanceOf(GateSlotWaitStoppedError);
    slots.release('other-forge-gate');
    expect(slots.tryAcquireAfterRealGates('gate-profile')).toBe(true);
  });

  test('takes no slot while a real gate of this process waits for one, and one once it got its own', async () => {
    const slots = inProcessSlots(1);
    slots.tryAcquire('real-gate-one');
    const waiting = slots.acquire('merge-gate');
    slots.startRound();
    slots.release('real-gate-one');

    expect(slots.tryAcquireAfterRealGates('gate-profile')).toBe(false);
    const releaseMergeGate = await waiting;
    releaseMergeGate();
    expect(slots.tryAcquireAfterRealGates('gate-profile')).toBe(true);
  });
});
