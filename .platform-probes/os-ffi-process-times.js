// bun:ffi calling GetProcessTimes on this process: the return value, last error and the four FILETIME values.
import { probe } from './support/probe.js';

await probe({
  unknown: 'ffi-process-times',
  appliesTo: ['win32'],
  observe: async () => {
    const { dlopen, FFIType, ptr } = await import('bun:ffi');
    const kernel32 = dlopen('kernel32.dll', {
      GetCurrentProcess: { args: [], returns: FFIType.ptr },
      GetProcessTimes: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
      GetLastError: { args: [], returns: FFIType.u32 },
    });
    const [creation, exit, kernel, user] = [new BigUint64Array(1), new BigUint64Array(1), new BigUint64Array(1), new BigUint64Array(1)];
    const returned = kernel32.symbols.GetProcessTimes(kernel32.symbols.GetCurrentProcess(), ptr(creation), ptr(exit), ptr(kernel), ptr(user));
    return {
      returned,
      lastError: kernel32.symbols.GetLastError(),
      creationFileTime: String(creation[0]),
      exitFileTime: String(exit[0]),
      kernelFileTime: String(kernel[0]),
      userFileTime: String(user[0]),
    };
  },
});
