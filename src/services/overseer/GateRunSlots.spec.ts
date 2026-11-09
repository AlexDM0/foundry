/**
 * A gate slot on Windows, over a fake kernel table. What matters: a gate Watcher that was spawned and never claimed answers for its slot through
 * the recorded process, so another acquirer waits while that process lives and takes the slot once it is gone. On Linux an in-process holder
 * whose Overseer is a zombie is not live, over recorded `/proc` stat text. And over injected file moves: a held-file failure on a slot create
 * is a taken slot on win32 and a fault elsewhere, and a held move aside leaves a stale slot in place.
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
import { createLinuxProcessIdentity }                      from '../../lib/process-identity/LinuxProcessIdentity.ts';
import { createPosixProcessGroups }                        from '../../lib/process-identity/PosixProcessGroups.ts';
import { createFakeWindowsKernel, fakeWindowsSupervision } from '../../testing/FakeWindowsKernel.ts';
import { nativePlatformPorts }                             from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory }  from '../../testing/ScratchWorkspace.ts';
import { GateRunSlots }                                    from './GateRunSlots.ts';
import { heldSlotCreateMeansTakenFor }                     from './HeldSlotCreateFor.ts';

const HOLDER_PROCESS_ID = 5001;
const CREATION_TIME = 134_000_000_000_000_001n;

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function slotsOver(ports: PlatformPorts, folder: string): ReturnType<typeof GateRunSlots.createGateRunSlots> {
  return GateRunSlots.createGateRunSlots({
    ports, folder, limit: 1, holderIsLive: (holding) => GateRunSlots.gateRunHolderIsLive(ports, holding), retryMilliseconds: 1,
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
    const holder = join(scratch, 'job', 'gate-watcher');
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

describe('a gate slot held in process on Linux', () => {
  function portsWhereThisProcessIsInState(state: string): PlatformPorts {
    const statText = `${process.pid} (bun) ${state} 1 ${process.pid} 5 0 -1 4194304 100 0 0 0 1 1 0 0 20 0 1 0 500 1024 10\n`;
    const reader = createLinuxProcessIdentity({
      fileText:         (path) => (path === `/proc/${process.pid}/stat` ? statText : null),
      directoryEntries: () => [String(process.pid)],
    });
    return { ...nativePlatformPorts(), processSupervision: createPosixProcessGroups(reader, { sendSignal: () => {} }) };
  }

  test('is not live once its Overseer is a zombie, which a signal probe still reaches', () => {
    expect(GateRunSlots.gateRunHolderIsLive(portsWhereThisProcessIsInState('Z'), { holder: GateRunSlots.inProcessHolderOf('merge'), process: null })).toBe(false);
  });

  test('is live while its Overseer runs', () => {
    expect(GateRunSlots.gateRunHolderIsLive(portsWhereThisProcessIsInState('S'), { holder: GateRunSlots.inProcessHolderOf('merge'), process: null })).toBe(true);
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
