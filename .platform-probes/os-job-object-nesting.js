// A Job Object nested under libuv's SILENT_BREAKAWAY job: whether a Bun child can be assigned, and whether terminating
// the job ends it. Records elevation, since assignment may differ for a standard user.
import { probe } from './support/probe.js';
import { elevationOf, killQuietly, sleepMilliseconds, startSleeper, processIsAlive } from './support/programs.js';

const PROCESS_ALL_ACCESS = 0x1FFFFF;
const JOB_SETTLE_MILLISECONDS = 500;

await probe({
  unknown: 'job-object-nesting',
  appliesTo: ['win32'],
  observe: async () => {
    const { dlopen, FFIType, ptr } = await import('bun:ffi');
    const kernel32 = dlopen('kernel32.dll', {
      GetCurrentProcess: { args: [], returns: FFIType.ptr },
      IsProcessInJob: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
      CreateJobObjectW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
      OpenProcess: { args: [FFIType.u32, FFIType.i32, FFIType.u32], returns: FFIType.ptr },
      AssignProcessToJobObject: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
      TerminateJobObject: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
      GetLastError: { args: [], returns: FFIType.u32 },
    });
    const { symbols } = kernel32;
    const isInJob = new Int32Array(1);
    const isProcessInJobReturned = symbols.IsProcessInJob(symbols.GetCurrentProcess(), null, ptr(isInJob));
    const job = symbols.CreateJobObjectW(null, null);
    const sleeper = startSleeper({ detached: false });
    await sleepMilliseconds(JOB_SETTLE_MILLISECONDS);
    const sleeperHandle = symbols.OpenProcess(PROCESS_ALL_ACCESS, 0, sleeper.pid);
    const assignReturned = symbols.AssignProcessToJobObject(job, sleeperHandle);
    const assignLastError = symbols.GetLastError();
    const terminateReturned = symbols.TerminateJobObject(job, 1);
    await sleepMilliseconds(JOB_SETTLE_MILLISECONDS);
    const sleeperAliveAfterTerminate = processIsAlive(sleeper.pid);
    killQuietly(sleeper.pid);
    return {
      isProcessInJobReturned,
      thisProcessIsInAJob: isInJob[0],
      jobHandle: String(job),
      assignReturned,
      assignLastError,
      terminateReturned,
      sleeperAliveAfterTerminate,
      elevation: await elevationOf(),
    };
  },
});
