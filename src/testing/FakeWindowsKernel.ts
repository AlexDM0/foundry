/**
 * The Windows kernel played in this process, at the level of its exports, so the buffers `WindowsKernelProcessApi.ts` reads run on any machine. A
 * process is a row of the table: its creation time, and whether it exited while a handle stays open to it.
 */
import type { ProcessIdentityPrimitives }                                                         from '../lib/process-identity/DarwinProcessIdentity.ts';
import type { ProcessSupervision }                                                                from '../lib/process-identity/ProcessSupervision.ts';
import { windowsProcessSupervision }                                                              from '../lib/process-identity/ProcessSupervisionFor.ts';
import { createWindowsKernelProcessApi, type WindowsKernelProcessApi, type WindowsKernelSymbols } from '../lib/process-identity/WindowsKernelProcessApi.ts';

export interface FakeKernelProcess {
  readonly creationTime: bigint;
  readonly hasExited?:   true;
}

export interface FakeWindowsKernel {
  readonly table:           Map<number, FakeKernelProcess>;
  readonly api:             WindowsKernelProcessApi;
  /** How many times the library was opened. */
  readonly opens:           () => number;
  /** Handles opened and not closed. */
  readonly openHandles:     () => number;
  /** Every later unknown process id reads as this row, for a spec whose real children the table cannot name up front. */
  readonly answerUnknownAs: (fakeProcess: FakeKernelProcess) => void;
}

export const FAKE_BOOT_ID_TEXT = '0x2a';

const FAKE_REGISTRY_ANSWER = `
HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters
    BootId    REG_DWORD    ${FAKE_BOOT_ID_TEXT}
`;

const STILL_ACTIVE_EXIT_CODE = 259;
const FAKE_EXITED_CODE = 0;
const CALL_SUCCEEDED = 1;
const NO_HANDLE = 0n;
const FIRST_FAKE_HANDLE = 4096n;
const FAKE_HANDLE_STEP = 4n;
const LITTLE_ENDIAN = true;

export function createFakeWindowsKernel(): FakeWindowsKernel {
  const table = new Map<number, FakeKernelProcess>();
  const handles = new Map<bigint, FakeKernelProcess>();
  let unknownProcess: FakeKernelProcess | null = null;
  let nextHandle = FIRST_FAKE_HANDLE;
  let opens = 0;

  const opened = (handle: bigint): FakeKernelProcess => {
    const fakeProcess = handles.get(handle);
    if (fakeProcess === undefined) throw new Error('a call on a handle the fake kernel never opened or already closed');
    return fakeProcess;
  };

  const symbols: WindowsKernelSymbols = {
    OpenProcess: (_desiredAccess, _inheritHandle, processId) => {
      const fakeProcess = table.get(processId) ?? unknownProcess;
      if (fakeProcess === null) return NO_HANDLE;
      nextHandle += FAKE_HANDLE_STEP;
      handles.set(nextHandle, fakeProcess);
      return nextHandle;
    },
    GetProcessTimes: (handle, creationTime) => {
      new DataView(creationTime.buffer).setBigUint64(0, opened(handle).creationTime, LITTLE_ENDIAN);
      return CALL_SUCCEEDED;
    },
    GetExitCodeProcess: (handle, exitCode) => {
      new DataView(exitCode.buffer).setUint32(0, opened(handle).hasExited === true ? FAKE_EXITED_CODE : STILL_ACTIVE_EXIT_CODE, LITTLE_ENDIAN);
      return CALL_SUCCEEDED;
    },
    CloseHandle: (handle) => {
      handles.delete(handle);
      return CALL_SUCCEEDED;
    },
  };

  return {
    table,
    api: createWindowsKernelProcessApi(() => {
      opens += 1;
      return symbols;
    }),
    opens:           () => opens,
    openHandles:     () => handles.size,
    answerUnknownAs: (fakeProcess) => {
      unknownProcess = fakeProcess;
    },
  };
}

export const FAKE_REGISTRY_PRIMITIVES: ProcessIdentityPrimitives = Object.freeze({ outputOfProgram: () => FAKE_REGISTRY_ANSWER });

export function fakeWindowsSupervision(kernel: FakeWindowsKernel): ProcessSupervision {
  return windowsProcessSupervision(kernel.api, FAKE_REGISTRY_PRIMITIVES);
}
