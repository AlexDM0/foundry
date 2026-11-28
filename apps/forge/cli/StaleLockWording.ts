/** A lock's taker that logs each stale lock record it takes over as a record, and one that prints it in words for a command outside Hephaestus. */
import type { HephaestusLog }       from '../src/adapters/@types/HephaestusLogRecord.ts';
import { HephaestusLogWordingUtil } from '../src/adapters/utils/HephaestusLogWordingUtil.ts';
import type { ProcessSupervision }  from '../src/lib/process-identity/ProcessSupervision.ts';
import type { LockTaker }           from '../src/services/tracker/GenerationLock.ts';
import { lockTakerOf }              from '../src/services/tracker/LockHolders.ts';

/** This process as a lock's taker on this platform, each stale record it takes over logged to `log`. */
export function hephaestusLogLockTakerOf(supervision: ProcessSupervision, log: HephaestusLog): LockTaker {
  return lockTakerOf(supervision, (staleTakenOver) => log({ kind: 'stale-lock-record-taken-over', ...staleTakenOver }));
}

/** This process as a lock's taker on this platform, each stale record it takes over written to `writeLine` in words. */
export function loggingLockTakerOf(supervision: ProcessSupervision, writeLine: (line: string) => void): LockTaker {
  return hephaestusLogLockTakerOf(supervision, (record) => writeLine(HephaestusLogWordingUtil.detailsOf(record)));
}
