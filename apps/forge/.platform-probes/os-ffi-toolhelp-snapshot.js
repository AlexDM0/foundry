// bun:ffi walking a CreateToolhelp32Snapshot: how many processes it lists and this process's own entry.
import { probe } from './support/probe.js';

const TH32CS_SNAPPROCESS = 2;
const PROCESSENTRY32W_BYTES = 568;
const PROCESS_ID_OFFSET = 8;
const PARENT_PROCESS_ID_OFFSET = 32;
const EXECUTABLE_NAME_OFFSET = 44;

await probe({
  unknown: 'ffi-toolhelp-snapshot',
  appliesTo: ['win32'],
  observe: async () => {
    const { dlopen, FFIType, ptr } = await import('bun:ffi');
    const kernel32 = dlopen('kernel32.dll', {
      CreateToolhelp32Snapshot: { args: [FFIType.u32, FFIType.u32], returns: FFIType.ptr },
      Process32FirstW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
      Process32NextW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
      CloseHandle: { args: [FFIType.ptr], returns: FFIType.i32 },
      GetLastError: { args: [], returns: FFIType.u32 },
    });
    const snapshot = kernel32.symbols.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    const entry = new DataView(new ArrayBuffer(PROCESSENTRY32W_BYTES));
    entry.setUint32(0, PROCESSENTRY32W_BYTES, true);
    const entryPointer = ptr(entry);
    let processCount = 0;
    let ownEntry = null;
    let more = kernel32.symbols.Process32FirstW(snapshot, entryPointer);
    const firstCallLastError = kernel32.symbols.GetLastError();
    while (more !== 0) {
      processCount += 1;
      if (entry.getUint32(PROCESS_ID_OFFSET, true) === process.pid) {
        ownEntry = {
          processId: process.pid,
          parentProcessId: entry.getUint32(PARENT_PROCESS_ID_OFFSET, true),
          executableName: new TextDecoder('utf-16le').decode(entry.buffer.slice(EXECUTABLE_NAME_OFFSET)).split('\0')[0],
        };
      }
      more = kernel32.symbols.Process32NextW(snapshot, entryPointer);
    }
    kernel32.symbols.CloseHandle(snapshot);
    return { snapshotHandle: String(snapshot), firstCallLastError, processCount, ownEntry };
  },
});
