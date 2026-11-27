/** The log lines of a stale lock record taken over, worded here at the boundary from the typed record a lock hands its taker. */
import type { ProcessSupervision }                                   from '../src/lib/process-identity/ProcessSupervision.ts';
import type { StaleHephaestusLockTakenOver }                         from '../src/services/hephaestus/HephaestusLock.ts';
import type { LockTaker, StaleLockReason, StaleLockRecordTakenOver } from '../src/services/tracker/GenerationLock.ts';
import { lockTakerOf }                                               from '../src/services/tracker/LockHolders.ts';

function staleReasonWordingOf(reason: StaleLockReason): string {
  return reason.kind === 'holder-gone' ? `the process ${reason.processId} it names is gone` : `it could not be read (${reason.reason})`;
}

export function staleLockRecordLineOf(staleTakenOver: StaleLockRecordTakenOver): string {
  return `The lock record ${staleTakenOver.recordPath} was stale and is taken over: ${staleReasonWordingOf(staleTakenOver.reason)}.`;
}

export function staleHephaestusLockLineOf(generation: number, staleTakenOver: StaleHephaestusLockTakenOver): string {
  return `Generation ${generation} took over the stale Hephaestus lock ${staleTakenOver.hephaestusLockFilePath}: ${staleReasonWordingOf(staleTakenOver.reason)}.`;
}

/** This process as a lock's taker on this platform, each stale record it takes over written to `writeLine` in words. */
export function loggingLockTakerOf(supervision: ProcessSupervision, writeLine: (line: string) => void): LockTaker {
  return lockTakerOf(supervision, (staleTakenOver) => writeLine(staleLockRecordLineOf(staleTakenOver)));
}
