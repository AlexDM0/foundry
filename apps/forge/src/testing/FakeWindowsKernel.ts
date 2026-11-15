/**
 * The Windows kernel played in this process, at the level of its exports, so the buffers `WindowsKernelProcessApi.ts` reads run on any machine. A
 * process is a row of the table: its creation time, its parent, and whether it exited while a handle stays open to it. `taskkill` is played over
 * the same table, `/T` taking the descendants too, and every program run is kept for a spec to read.
 */
import type { ProcessIdentityPrimitives } from '../lib/process-identity/DarwinProcessIdentity.ts';
import type { ProcessSupervision }        from '../lib/process-identity/ProcessSupervision.ts';
import { windowsProcessSupervision }      from '../lib/process-identity/ProcessSupervisionFor.ts';
import {
  type WindowsKernelProcessApi,
  type WindowsKernelSymbols,
  createWindowsKernelProcessApi,
  PROCESS_ENTRY_BYTES,
  PROCESS_ENTRY_PARENT_ID_OFFSET,
  PROCESS_ENTRY_PROCESS_ID_OFFSET
} from '../lib/process-identity/WindowsKernelProcessApi.ts';

export interface FakeKernelProcess {
  readonly creationTime:     bigint;
  readonly hasExited?:       true;
  readonly parentProcessId?: number;
  /** `taskkill` fails on it and it stays, as a process of another user does. */
  readonly refusesStop?:     true;
}

export interface FakeWindowsKernel {
  readonly table:           Map<number, FakeKernelProcess>;
  readonly api:             WindowsKernelProcessApi;
  /** The registry and `taskkill` of this table. */
  readonly primitives:      ProcessIdentityPrimitives;
  /** The argv of every program run, in order. */
  readonly programs:        (readonly string[])[];
  /** Every later snapshot fails. */
  readonly failSnapshots:   () => void;
  /** How many times the library was opened. */
  readonly opens:           () => number;
  /** Handles opened and not closed. */
  readonly openHandles:     () => number;
  /** Every later unknown process id reads as this row, for a spec whose real children the table cannot name up front. */
  readonly answerUnknownAs: (fakeProcess: FakeKernelProcess) => void;
}

export const FAKE_BOOT_ID_TEXT = '0x2a';

export const FAKE_SYSTEM_ROOT = 'C:\\Windows';

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
const INVALID_SNAPSHOT_HANDLE = 0xFFFF_FFFF_FFFF_FFFFn;
const CALL_FAILED = 0;
const TASK_KILL_PROCESS_ID_INDEX = 2;

function isDescendantOf(table: ReadonlyMap<number, FakeKernelProcess>, processId: number, ancestorId: number): boolean {
  const parentId = table.get(processId)?.parentProcessId;
  if (parentId === undefined) return false;
  return parentId === ancestorId || isDescendantOf(table, parentId, ancestorId);
}

function runFakeTaskKill(table: Map<number, FakeKernelProcess>, argv: readonly string[]): string | null {
  const processId = Number(argv[TASK_KILL_PROCESS_ID_INDEX]);
  if (!table.has(processId)) return null;
  const reached = [processId, ...argv.includes('/T') ? [...table.keys()].filter((candidate) => isDescendantOf(table, candidate, processId)) : []];
  const ended = reached.filter((candidate) => table.get(candidate)?.refusesStop !== true);
  for (const candidate of ended) table.delete(candidate);
  return ended.length === reached.length ? 'SUCCESS' : null;
}

export function createFakeWindowsKernel(): FakeWindowsKernel {
  const table = new Map<number, FakeKernelProcess>();
  const handles = new Map<bigint, FakeKernelProcess>();
  const snapshots = new Map<bigint, number[]>();
  const programs: (readonly string[])[] = [];
  let snapshotsFail = false;
  let unknownProcess: FakeKernelProcess | null = null;
  let nextHandle = FIRST_FAKE_HANDLE;
  let opens = 0;

  const opened = (handle: bigint): FakeKernelProcess => {
    const fakeProcess = handles.get(handle);
    if (fakeProcess === undefined) throw new Error('a call on a handle the fake kernel never opened or already closed');
    return fakeProcess;
  };

  const writeNextEntry = (snapshot: bigint, entry: Uint8Array): number => {
    const view = new DataView(entry.buffer);
    if (view.getUint32(0, LITTLE_ENDIAN) !== PROCESS_ENTRY_BYTES) throw new Error('an entry without its size filled in');
    const processId = snapshots.get(snapshot)?.shift();
    if (processId === undefined) return CALL_FAILED;
    view.setUint32(PROCESS_ENTRY_PROCESS_ID_OFFSET, processId, LITTLE_ENDIAN);
    view.setUint32(PROCESS_ENTRY_PARENT_ID_OFFSET, table.get(processId)?.parentProcessId ?? 0, LITTLE_ENDIAN);
    return CALL_SUCCEEDED;
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
      snapshots.delete(handle);
      return CALL_SUCCEEDED;
    },
    CreateToolhelp32Snapshot: () => {
      if (snapshotsFail) return INVALID_SNAPSHOT_HANDLE;
      nextHandle += FAKE_HANDLE_STEP;
      snapshots.set(nextHandle, [...table.keys()]);
      return nextHandle;
    },
    Process32FirstW: writeNextEntry,
    Process32NextW:  writeNextEntry,
  };

  return {
    table,
    api: createWindowsKernelProcessApi(() => {
      opens += 1;
      return symbols;
    }),
    primitives: {
      outputOfProgram: (argv, environment) => {
        programs.push(argv);
        return argv[0]?.endsWith('taskkill.exe') === true ? runFakeTaskKill(table, argv) : FAKE_REGISTRY_PRIMITIVES.outputOfProgram(argv, environment);
      },
    },
    programs,
    failSnapshots: () => {
      snapshotsFail = true;
    },
    opens:           () => opens,
    openHandles:     () => handles.size + snapshots.size,
    answerUnknownAs: (fakeProcess) => {
      unknownProcess = fakeProcess;
    },
  };
}

export const FAKE_REGISTRY_PRIMITIVES: ProcessIdentityPrimitives = Object.freeze({ outputOfProgram: () => FAKE_REGISTRY_ANSWER });

export function fakeWindowsSupervision(kernel: FakeWindowsKernel): ProcessSupervision {
  return windowsProcessSupervision(kernel.api, kernel.primitives, FAKE_SYSTEM_ROOT);
}
