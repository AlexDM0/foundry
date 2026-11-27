/**
 * The Windows identity over a fake kernel table and a fake `reg.exe`. What matters: the stamp stays exact text beyond 2^53 from the kernel's bytes
 * to the stored record, an exited process has no identity, every handle closes, the kernel binding opens only on the first identity call, the
 * boot is read once with SystemRoot in its environment, and a failed boot read costs a reboot's name and nothing else.
 */
import { describe, expect, test } from 'bun:test';

import {
  createFakeWindowsKernel,
  FAKE_BOOT_ID_TEXT,
  FAKE_REGISTRY_PRIMITIVES,
  fakeWindowsSupervision
} from '../../testing/FakeWindowsKernel.ts';
import {
  sameBoot,
  sameProcess,
  startedBefore,
  storedIdentityOf,
  UNREADABLE_BOOT_IDENTITY
} from './ProcessIdentity.ts';
import { processSupervisionFor, windowsProcessSupervision }            from './ProcessSupervisionFor.ts';
import { createWindowsKernelProcessApi, type WindowsKernelProcessApi } from './WindowsKernelProcessApi.ts';
import {
  createWindowsProcessIdentity,
  WINDOWS_BOOT_IDENTITY_SOURCE,
  WINDOWS_PROCESS_IDENTITY_ROUTE,
  windowsSystemToolsOf
} from './WindowsProcessIdentity.ts';

const PROCESS_ID = 4242;
const OTHER_PROCESS_ID = 4243;
const CHILD_PROCESS_ID = 4244;
const EXAMPLE_SYSTEM_ROOT = 'D:\\Example';
// A FILETIME of 2026: above 2^53, so one 100-nanosecond tick more rounds to the same number.
const CREATION_TIME = 134_000_000_000_000_001n;
const ONE_TICK_LATER = CREATION_TIME + 1n;

describe('the start stamp', () => {
  test('is the exact decimal text of the FILETIME, whatever its size', () => {
    const kernel = createFakeWindowsKernel();
    const supervision = fakeWindowsSupervision(kernel);
    kernel.table.set(PROCESS_ID, { creationTime: CREATION_TIME });
    kernel.table.set(OTHER_PROCESS_ID, { creationTime: 2n ** 64n - 1n });
    expect(supervision.identityOf(PROCESS_ID)?.startStamp).toBe('134000000000000001');
    expect(supervision.identityOf(OTHER_PROCESS_ID)?.startStamp).toBe('18446744073709551615');
  });

  test('two stamps that differ only beyond 2^53 order, and keep their order through a stored record', () => {
    expect(Number(CREATION_TIME)).toBe(Number(ONE_TICK_LATER));
    const kernel = createFakeWindowsKernel();
    const supervision = fakeWindowsSupervision(kernel);
    kernel.table.set(PROCESS_ID, { creationTime: CREATION_TIME });
    kernel.table.set(OTHER_PROCESS_ID, { creationTime: ONE_TICK_LATER });
    const earlier = storedIdentityOf(JSON.parse(JSON.stringify(supervision.identityOf(PROCESS_ID))));
    const later   = storedIdentityOf(JSON.parse(JSON.stringify(supervision.identityOf(OTHER_PROCESS_ID))));
    expect(startedBefore(earlier?.startStamp ?? '', later?.startStamp ?? '')).toBe(true);
    expect(startedBefore(later?.startStamp ?? '', earlier?.startStamp ?? '')).toBe(false);
  });
});

describe('the process table', () => {
  test('a process that is not in it, or an impossible id, has no identity', () => {
    const supervision = fakeWindowsSupervision(createFakeWindowsKernel());
    expect(supervision.identityOf(PROCESS_ID)).toBeNull();
    expect(supervision.identityOf(0)).toBeNull();
    expect(supervision.identityOf(-1)).toBeNull();
    expect(supervision.identityOf(1.5)).toBeNull();
  });

  test('a process that exited while a handle keeps it open has no identity', () => {
    const kernel = createFakeWindowsKernel();
    kernel.table.set(PROCESS_ID, { creationTime: CREATION_TIME, hasExited: true });
    expect(fakeWindowsSupervision(kernel).identityOf(PROCESS_ID)).toBeNull();
  });

  test('every handle it opened is closed, on each answer', () => {
    const kernel = createFakeWindowsKernel();
    kernel.table.set(PROCESS_ID, { creationTime: CREATION_TIME });
    kernel.table.set(OTHER_PROCESS_ID, { creationTime: CREATION_TIME, hasExited: true });
    const supervision = fakeWindowsSupervision(kernel);
    supervision.identityOf(PROCESS_ID);
    supervision.identityOf(OTHER_PROCESS_ID);
    expect(kernel.openHandles()).toBe(0);
  });

  test('a kernel that cannot be opened reads as no identity, never a throw', () => {
    const unopenable = createWindowsKernelProcessApi(() => {
      throw new Error('example dlopen failure');
    });
    expect(unopenable.creationTimeOf(PROCESS_ID)).toBeNull();
    expect(unopenable.processSnapshot()).toBeNull();
  });
});

describe('the kernel binding', () => {
  test('opens on the first identity call and never again, and not when the adapter is built', () => {
    const kernel = createFakeWindowsKernel();
    kernel.table.set(PROCESS_ID, { creationTime: CREATION_TIME });
    const supervision = fakeWindowsSupervision(kernel);
    supervision.identitySourcesOf(PROCESS_ID);
    supervision.startedBefore('1', '2');
    expect(kernel.opens()).toBe(0);
    supervision.identityOf(PROCESS_ID);
    supervision.identityOf(PROCESS_ID);
    expect(kernel.opens()).toBe(1);
  });

  test('on this machine, without kernel32, the real selector builds and its first identity call answers null', () => {
    const supervision = processSupervisionFor('win32');
    if (process.platform !== 'win32') expect(supervision.identityOf(process.pid)).toBeNull();
  });
});

describe('the boot identity', () => {
  function readerRecordingPrograms(systemRoot: string | undefined) {
    const programs: { argv: readonly string[]; environment: Readonly<Record<string, string>> }[] = [];
    const kernel = createFakeWindowsKernel();
    kernel.table.set(PROCESS_ID, { creationTime: CREATION_TIME });
    kernel.table.set(OTHER_PROCESS_ID, { creationTime: CREATION_TIME });
    const reader = createWindowsProcessIdentity(kernel.api, {
      outputOfProgram: (argv, environment) => {
        programs.push({ argv, environment });
        return FAKE_REGISTRY_PRIMITIVES.outputOfProgram(argv, environment);
      },
    }, windowsSystemToolsOf(systemRoot));
    return { reader, programs };
  }

  test('is the BootId value, read once per process through the reg.exe of the given SystemRoot with SystemRoot set', () => {
    const { reader, programs } = readerRecordingPrograms(EXAMPLE_SYSTEM_ROOT);
    expect(reader.identityOf(PROCESS_ID)?.bootIdentity).toBe(FAKE_BOOT_ID_TEXT);
    reader.identityOf(OTHER_PROCESS_ID);
    expect(programs).toHaveLength(1);
    expect(programs[0]?.argv.slice(0, 2)).toEqual(['D:\\Example\\System32\\reg.exe', 'query']);
    expect(programs[0]?.environment['SystemRoot']).toBe(EXAMPLE_SYSTEM_ROOT);
  });

  test.each([['unset', undefined], ['relative', 'Windows'], ['blank', ' ']] as const)('with a SystemRoot %s it runs no program and reads as unreadable', (_case, systemRoot) => {
    const { reader, programs } = readerRecordingPrograms(systemRoot);
    expect(reader.identityOf(PROCESS_ID)?.bootIdentity).toBe(UNREADABLE_BOOT_IDENTITY);
    expect(programs).toEqual([]);
  });

  test.each([['the program fails', null], ['the value is missing', 'ERROR: The system was unable to find the value']] as const)(
    'when %s it answers the stable unreadable text, and a stamp still decides who is who',
    (_case, registryOutput) => {
      const kernel = createFakeWindowsKernel();
      kernel.table.set(PROCESS_ID, { creationTime: CREATION_TIME });
      const reader = createWindowsProcessIdentity(kernel.api, { outputOfProgram: () => registryOutput }, windowsSystemToolsOf(EXAMPLE_SYSTEM_ROOT));
      const identity = reader.identityOf(PROCESS_ID);
      expect(identity).toEqual({ processId: PROCESS_ID, startStamp: String(CREATION_TIME), bootIdentity: UNREADABLE_BOOT_IDENTITY });
      const recorded = { processId: PROCESS_ID, startStamp: String(CREATION_TIME), bootIdentity: FAKE_BOOT_ID_TEXT };
      expect(identity !== null && sameProcess(recorded, identity)).toBe(true);
      expect(identity !== null && sameProcess({ ...recorded, startStamp: '1' }, identity)).toBe(false);
    },
  );

  test('two readable boots that differ stay two boots', () => {
    expect(sameBoot('0x2a', '0x2b')).toBe(false);
    expect(sameBoot('0x2a', '0x2a')).toBe(true);
    expect(sameBoot('0x2a', UNREADABLE_BOOT_IDENTITY)).toBe(true);
    expect(sameBoot(UNREADABLE_BOOT_IDENTITY, '0x2a')).toBe(true);
  });
});

describe('the boot\'s start', () => {
  test('answers null, so the rule that needs it is off, and runs no program and opens no kernel', () => {
    const programs: (readonly string[])[] = [];
    const kernel = createFakeWindowsKernel();
    const reader = createWindowsProcessIdentity(kernel.api, {
      outputOfProgram: (argv) => {
        programs.push(argv);
        return null;
      },
    }, windowsSystemToolsOf(EXAMPLE_SYSTEM_ROOT));
    expect(reader.bootStartedAtEpochSeconds()).toBeNull();
    expect(fakeWindowsSupervision(kernel).bootStartedAtEpochSeconds()).toBeNull();
    expect(processSupervisionFor('win32').bootStartedAtEpochSeconds()).toBeNull();
    expect(programs).toEqual([]);
    expect(kernel.opens()).toBe(0);
  });
});

describe('the selector', () => {
  test('answers win32 with the Windows adapter, whose sources name the kernel route and the boot value, and which cannot ask one process to stop', () => {
    const supervision = processSupervisionFor('win32');
    expect(supervision.identitySourcesOf(PROCESS_ID)).toEqual([`${WINDOWS_PROCESS_IDENTITY_ROUTE} GetProcessTimes ${PROCESS_ID}`, WINDOWS_BOOT_IDENTITY_SOURCE]);
    expect(supervision.stopProcess(PROCESS_ID, 'ask').verdict).toBe('refused');
    expect(WINDOWS_PROCESS_IDENTITY_ROUTE).toBe('kernel32-ffi');
  });
});

describe('a forced tree stop', () => {
  const leader = { processId: PROCESS_ID, startStamp: String(CREATION_TIME), bootIdentity: FAKE_BOOT_ID_TEXT };

  function kernelWithLeaderAndChild() {
    const kernel = createFakeWindowsKernel();
    kernel.table.set(PROCESS_ID, { creationTime: CREATION_TIME });
    kernel.table.set(CHILD_PROCESS_ID, { creationTime: ONE_TICK_LATER, parentProcessId: PROCESS_ID });
    return kernel;
  }

  test('runs the taskkill of the given SystemRoot', () => {
    const kernel = kernelWithLeaderAndChild();
    expect(windowsProcessSupervision(kernel.api, kernel.primitives, EXAMPLE_SYSTEM_ROOT).stopTree(leader, 'force')).toEqual({ verdict: 'signalled' });
    expect(kernel.programs.map((argv) => argv[0])).toContain('D:\\Example\\System32\\taskkill.exe');
    expect(kernel.programs.every((argv) => argv[0]?.startsWith('D:\\Example\\System32\\') === true)).toBe(true);
  });

  test.each([['unset', undefined], ['relative', 'Windows']] as const)('with a SystemRoot %s refuses, naming SystemRoot, and runs no program', (_case, systemRoot) => {
    const kernel = kernelWithLeaderAndChild();
    const supervision = windowsProcessSupervision(kernel.api, kernel.primitives, systemRoot);
    const outcome = supervision.stopTree(leader, 'force');
    expect(outcome.verdict).toBe('refused');
    expect(outcome).toEqual({ verdict: 'refused', refusal: { cause: 'no-system-root' } });
    expect(supervision.stopProcess(CHILD_PROCESS_ID, 'force').verdict).toBe('refused');
    expect(kernel.programs).toEqual([]);
    expect(kernel.table.has(CHILD_PROCESS_ID)).toBe(true);
  });

  test('refuses, naming the child, when a child the snapshot lists has a start that cannot be read', () => {
    const kernel = kernelWithLeaderAndChild();
    const api: WindowsKernelProcessApi = {
      ...kernel.api,
      creationTimeOf: (processId) => (processId === CHILD_PROCESS_ID ? null : kernel.api.creationTimeOf(processId)),
    };
    const supervision = windowsProcessSupervision(api, kernel.primitives, EXAMPLE_SYSTEM_ROOT);
    const outcome = supervision.stopTree(leader, 'force');
    expect(outcome.verdict).toBe('refused');
    expect(outcome).toMatchObject({ verdict: 'refused', refusal: { cause: 'tree-starts-unreadable', processIds: [CHILD_PROCESS_ID] } });
    expect(supervision.treeMembersOf(leader)).toBeNull();
    expect(kernel.table.has(CHILD_PROCESS_ID)).toBe(true);
  });

  test('refuses when a listed child whose start read null reads a start on the second look, since the walk left it out', () => {
    const kernel = kernelWithLeaderAndChild();
    let childReads = 0;
    const api: WindowsKernelProcessApi = {
      ...kernel.api,
      creationTimeOf: (processId) => {
        if (processId !== CHILD_PROCESS_ID) return kernel.api.creationTimeOf(processId);
        childReads += 1;
        return childReads === 1 ? null : kernel.api.creationTimeOf(processId);
      },
    };
    const outcome = windowsProcessSupervision(api, kernel.primitives, EXAMPLE_SYSTEM_ROOT).stopTree(leader, 'force');
    expect(outcome.verdict).toBe('refused');
    expect(kernel.table.has(CHILD_PROCESS_ID)).toBe(true);
  });

  test('leaves out a child whose start reads null once a fresh snapshot no longer lists it, as before', () => {
    const kernel = kernelWithLeaderAndChild();
    let snapshotsTaken = 0;
    const api: WindowsKernelProcessApi = {
      creationTimeOf:  (processId) => (processId === CHILD_PROCESS_ID ? null : kernel.api.creationTimeOf(processId)),
      processSnapshot: () => {
        snapshotsTaken += 1;
        const rows = kernel.api.processSnapshot();
        return snapshotsTaken === 1 ? rows : rows?.filter((row) => row.processId !== CHILD_PROCESS_ID) ?? null;
      },
    };
    const supervision = windowsProcessSupervision(api, kernel.primitives, EXAMPLE_SYSTEM_ROOT);
    expect(supervision.treeMembersOf(leader)).toEqual([{ processId: PROCESS_ID, startStamp: String(CREATION_TIME), processGroupId: PROCESS_ID }]);
  });
});
