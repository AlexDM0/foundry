/**
 * The one file that calls the Windows kernel, through `bun:ffi`: the creation time of a process, as the decimal text of its FILETIME. A FILETIME
 * exceeds 2^53, so it is read as a BigInt and never passes through a number. `dlopen` runs on the first call and never at import, so a bundle
 * holding this file loads on every platform.
 */
import { dlopen, FFIType } from 'bun:ffi';

/** The kernel32 exports read here, under the names the kernel gives them. A `BOOL` is an `i32`; a `HANDLE` is a `u64`, `0` when none opened. */
export interface WindowsKernelSymbols {
  readonly OpenProcess:        (desiredAccess: number, inheritHandle: number, processId: number) => bigint;
  readonly GetProcessTimes:    (processHandle: bigint, creationTime: Uint8Array, exitTime: Uint8Array, kernelTime: Uint8Array, userTime: Uint8Array) => number;
  readonly GetExitCodeProcess: (processHandle: bigint, exitCode: Uint8Array) => number;
  readonly CloseHandle:        (processHandle: bigint) => number;
}

export interface WindowsKernelProcessApi {
  /** `null` for a process that does not exist, that has exited, or whose times cannot be read. */
  readonly creationTimeOf: (processId: number) => string | null;
}

const KERNEL_LIBRARY = 'kernel32.dll';

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const HANDLE_NOT_INHERITED = 0;
const NO_HANDLE = 0n;
const CALL_FAILED = 0;

// A process that exited stays open while anybody holds a handle to it, and the kernel still answers its times.
const STILL_ACTIVE_EXIT_CODE = 259;

const FILETIME_BYTES = 8;
const DWORD_BYTES = 4;
const LITTLE_ENDIAN = true;

function openKernel32(): WindowsKernelSymbols {
  return dlopen(KERNEL_LIBRARY, {
    OpenProcess:        { args: [FFIType.u32, FFIType.i32, FFIType.u32], returns: FFIType.u64 },
    GetProcessTimes:    { args: [FFIType.u64, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
    GetExitCodeProcess: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
    CloseHandle:        { args: [FFIType.u64], returns: FFIType.i32 },
  }).symbols;
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer);
}

function processHasExited(kernel: WindowsKernelSymbols, processHandle: bigint): boolean {
  const exitCode = new Uint8Array(DWORD_BYTES);
  if (kernel.GetExitCodeProcess(processHandle, exitCode) === CALL_FAILED) return true;
  return viewOf(exitCode).getUint32(0, LITTLE_ENDIAN) !== STILL_ACTIVE_EXIT_CODE;
}

function creationTimeOfOpen(kernel: WindowsKernelSymbols, processHandle: bigint): string | null {
  const creationTime = new Uint8Array(FILETIME_BYTES);
  const unusedTimes  = [new Uint8Array(FILETIME_BYTES), new Uint8Array(FILETIME_BYTES), new Uint8Array(FILETIME_BYTES)] as const;
  if (kernel.GetProcessTimes(processHandle, creationTime, ...unusedTimes) === CALL_FAILED) return null;
  return processHasExited(kernel, processHandle) ? null : viewOf(creationTime).getBigUint64(0, LITTLE_ENDIAN).toString();
}

export function createWindowsKernelProcessApi(openKernel: () => WindowsKernelSymbols = openKernel32): WindowsKernelProcessApi {
  let kernel: WindowsKernelSymbols | null = null;

  function creationTimeOf(processId: number): string | null {
    try {
      kernel ??= openKernel();
      const processHandle = kernel.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, HANDLE_NOT_INHERITED, processId);
      if (processHandle === NO_HANDLE) return null;
      try {
        return creationTimeOfOpen(kernel, processHandle);
      } finally {
        kernel.CloseHandle(processHandle);
      }
    } catch {
      return null;
    }
  }

  return Object.freeze({ creationTimeOf });
}
