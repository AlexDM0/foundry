/**
 * Which process a pid names, beyond the pid: its start stamp and the boot it started in, so a reused pid or a reboot never reads as the
 * same process, and a timezone change never reads as a different one. What holds on every platform lives here; reading an identity and
 * stopping a process are the `ProcessSupervision` port's. It depends on no other package.
 */

export interface ProcessIdentity {
  processId:    number;
  /** Decimal text of a count that means something only to the reader that wrote it: compared within one reader, never calculated with. */
  startStamp:   string;
  bootIdentity: string;
}

export type ProcessStartStamp = ProcessIdentity['startStamp'];

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

const START_STAMP_PATTERN = /^\d+$/;

export function errorCodeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined;
}

export function errorSaysNoSuchProcess(error: unknown): boolean {
  return errorCodeOf(error) === NO_SUCH_PROCESS_CODE;
}

export function sameProcess(first: ProcessIdentity, second: ProcessIdentity): boolean {
  return first.processId === second.processId
    && first.startStamp === second.startStamp
    && first.bootIdentity === second.bootIdentity;
}

/** Decimal text without leading zeros orders by its length, then by its digits. */
export function startedBefore(firstStamp: ProcessStartStamp, secondStamp: ProcessStartStamp): boolean {
  return firstStamp.length === secondStamp.length ? firstStamp < secondStamp : firstStamp.length < secondStamp.length;
}

/**
 * A stored start as a stamp. A record of a process still live across the rename holds the number once stored as `startEpochSeconds`, and
 * its decimal text is exactly what the macOS reader answers now, so that process keeps reading as itself. Anything else is no stamp.
 */
export function startStampOfStored(storedStart: unknown): ProcessStartStamp | null {
  if (typeof storedStart === 'string') return START_STAMP_PATTERN.test(storedStart) ? storedStart : null;
  return Number.isSafeInteger(storedStart) && (storedStart as number) >= 0 ? String(storedStart) : null;
}

/** An identity read back from a stored record, under either name of its start; `null` when it is not one. */
export function storedIdentityOf(stored: unknown): ProcessIdentity | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const {
    processId, startStamp, startEpochSeconds, bootIdentity
  } = stored as Record<string, unknown>;
  const readStamp = startStampOfStored(startStamp ?? startEpochSeconds);
  if (typeof processId !== 'number' || typeof bootIdentity !== 'string' || readStamp === null) return null;
  return { processId, startStamp: readStamp, bootIdentity };
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
