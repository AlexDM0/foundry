/**
 * Which process a pid names, beyond the pid: its start in epoch seconds and the boot it started in, so a reused pid or a reboot never
 * reads as the same process, and a timezone change never reads as a different one. What holds on every platform lives here; reading an
 * identity and stopping a process are the `ProcessSupervision` port's. It depends on no other package.
 */

export interface ProcessIdentity {
  processId:         number;
  /** The port's opaque start stamp: only the port compares it, and it is stored exactly as read. */
  startEpochSeconds: number;
  bootIdentity:      string;
}

export type ProcessStartStamp = ProcessIdentity['startEpochSeconds'];

export type ProcessTreeStopOutcome =
  | { verdict: 'signalled' }
  | { verdict: 'group-gone' }
  | { verdict: 'group-recycled' }
  | { verdict: 'identity-mismatch'; currentIdentity: ProcessIdentity }
  | { verdict: 'refused'; reason: string };

export type ChildEnd =
  | { reason: 'exited'; exitCode: number | null; signal: null }
  | { reason: 'signalled'; exitCode: null; signal: string };

const NO_SUCH_PROCESS_CODE = 'ESRCH';

export function errorCodeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined;
}

export function errorSaysNoSuchProcess(error: unknown): boolean {
  return errorCodeOf(error) === NO_SUCH_PROCESS_CODE;
}

export function sameProcess(first: ProcessIdentity, second: ProcessIdentity): boolean {
  return first.processId === second.processId
    && first.startEpochSeconds === second.startEpochSeconds
    && first.bootIdentity === second.bootIdentity;
}

export function startedBefore(firstStamp: ProcessStartStamp, secondStamp: ProcessStartStamp): boolean {
  return firstStamp < secondStamp;
}

/**
 * Anything other than `ESRCH` means alive: `EPERM` is a live process owned by another user, and
 * reading it as dead would hand one user's lock to another. A non-positive id is refused before the
 * call, because `process.kill(0, …)` addresses the caller's whole process group.
 */
export function processIsGone(processId: number): boolean {
  if (!Number.isSafeInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return false;
  } catch (error) {
    return errorSaysNoSuchProcess(error);
  }
}

/** How a child that ran ended, read from what the runtime reports of it once it exited. */
export function childEndOf(child: { readonly exitCode: number | null; readonly signalCode: string | null }): ChildEnd {
  return child.signalCode === null
    ? { reason: 'exited', exitCode: child.exitCode, signal: null }
    : { reason: 'signalled', exitCode: null, signal: child.signalCode };
}
