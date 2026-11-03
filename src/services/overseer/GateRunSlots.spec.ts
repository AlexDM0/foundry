/**
 * A gate slot on Windows, over a fake kernel table. What matters: a gate Watcher that was spawned and never claimed answers for its slot through
 * the recorded process, so another acquirer waits while that process lives and takes the slot once it is gone. On Linux an in-process holder
 * whose Overseer is a zombie is not live, over recorded `/proc` stat text.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { PlatformPorts }                                         from '../../lib/platform-ports/PlatformPortsFor.ts';
import { createLinuxProcessIdentity }                                 from '../../lib/process-identity/LinuxProcessIdentity.ts';
import { createPosixProcessGroups }                                   from '../../lib/process-identity/PosixProcessGroups.ts';
import { createFakeWindowsKernel, fakeWindowsSupervision }            from '../../testing/FakeWindowsKernel.ts';
import { nativePlatformPorts }                                        from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory }             from '../../testing/ScratchWorkspace.ts';
import { createGateRunSlots, gateRunHolderIsLive, inProcessHolderOf } from './GateRunSlots.ts';

const HOLDER_PROCESS_ID = 5001;
const CREATION_TIME = 134_000_000_000_000_001n;

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function slotsOver(ports: PlatformPorts, folder: string): ReturnType<typeof createGateRunSlots> {
  return createGateRunSlots({
    ports, folder, limit: 1, holderIsLive: (holding) => gateRunHolderIsLive(ports, holding), retryMilliseconds: 1,
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
    expect(gateRunHolderIsLive(portsWhereThisProcessIsInState('Z'), { holder: inProcessHolderOf('merge'), process: null })).toBe(false);
  });

  test('is live while its Overseer runs', () => {
    expect(gateRunHolderIsLive(portsWhereThisProcessIsInState('S'), { holder: inProcessHolderOf('merge'), process: null })).toBe(true);
  });
});
