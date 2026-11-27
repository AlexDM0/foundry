/**
 * The one Hephaestus of a board, by generations on the `src/services/tracker/TrackerLock.ts` scheme: each start creates
 * `<data>/hephaestus/lock-<n>.json` exclusively, never rewritten, and the newest generation naming a live process identity is Hephaestus.
 * Nobody unlinks a Hephaestus lock it does not hold; the holder removes the generations below its own.
 */
import { readdirSync, unlinkSync } from 'node:fs';
import { join }                    from 'node:path';

import type { HephaestusLockProblem }                             from '../../adapters/hephaestus-lock/@types/HephaestusLockProblem.ts';
import { HephaestusLockIngestion, type HephaestusLockFileRecord } from '../../adapters/hephaestus-lock/HephaestusLockIngestion.ts';
import { createHephaestusLockWriter }                             from '../../adapters/hephaestus-lock/HephaestusLockWriter.ts';
import type { ExclusiveCreation, FileReplace }                    from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                               from '../../lib/atomic-file/FileReplaceFor.ts';
import type { PlatformPorts }                                     from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                   from '../../lib/process-identity/ProcessIdentity.ts';
import { OperationRefusal }                                       from '../../shared/OperationRefusal.ts';
import type { StaleLockReason }                                   from '../tracker/GenerationLock.ts';

/** What a Hephaestus lock names, as its ingestion reads it; the CLI's readers name it from here. */
export type HephaestusLockRecord = HephaestusLockFileRecord;

/**
 * The one reading every reader of the lock goes through. A lock of today's fields is judged by its process whatever its version, so a live
 * Hephaestus of older code reads live; one that cannot be read names no process, so it reads as dead and a start takes it over, logged. A
 * partial lock would hand the board to a second Hephaestus, so where hard links fail the claim is refused `hephaestus-lock-not-created-whole`,
 * never created by the open fallback.
 */
export type HephaestusLockReading =
  | { verdict: 'none' }
  | { verdict: 'live'; generation: number; record: HephaestusLockRecord }
  | { verdict: 'dead'; generation: number; record: HephaestusLockRecord | null; unreadableProblem?: HephaestusLockProblem };

/** A stale newest generation this acquisition took over, its process gone or the file unreadable, as a typed record the taker's log words. */
export interface StaleHephaestusLockTakenOver {
  hephaestusLockFilePath: string;
  /** `null` for a lock removed between the listing and its read, so nothing says why. */
  reason:                 StaleLockReason<HephaestusLockProblem | null>;
}

export type HephaestusLockAcquisition =
  | { verdict: 'acquired'; generation: number; staleTakenOver?: StaleHephaestusLockTakenOver }
  | { verdict: 'already-running'; generation: number; record: HephaestusLockRecord }
  | { verdict: 'contended' };

const HEPHAESTUS_LOCK_FILE_PATTERN = /^lock-(\d+)\.json$/;

function filePathFor(hephaestusDirectory: string, generation: number): string {
  return join(hephaestusDirectory, `lock-${generation}.json`);
}

/** Ascending; an absent folder holds no generation. */
function generationsIn(hephaestusDirectory: string): number[] {
  let fileNames: string[];
  try {
    fileNames = readdirSync(hephaestusDirectory);
  } catch {
    return [];
  }
  return fileNames
    .map((fileName) => HEPHAESTUS_LOCK_FILE_PATTERN.exec(fileName)?.[1])
    .filter((digits): digits is string => digits !== undefined)
    .map(Number)
    .filter((generation) => Number.isSafeInteger(generation))
    .sort((a, b) => a - b);
}

function identityNamedBy(record: HephaestusLockRecord): ProcessIdentity {
  return { processId: record.processId, startStamp: record.processStartStamp, bootIdentity: record.bootIdentity };
}

/** Live only while the process the Hephaestus lock names is still that process: a reused pid or a reboot reads as dead. */
function hephaestusLockNamesALiveProcess({ processSupervision }: PlatformPorts, record: HephaestusLockRecord): boolean {
  const currentIdentity = processSupervision.identityOf(record.processId);
  return currentIdentity !== null && processSupervision.sameProcess(currentIdentity, identityNamedBy(record));
}

function newestOf(ports: PlatformPorts, hephaestusDirectory: string): HephaestusLockReading {
  const newest = generationsIn(hephaestusDirectory).at(-1);
  if (newest === undefined) return { verdict: 'none' };
  const reading = new HephaestusLockIngestion(filePathFor(hephaestusDirectory, newest)).read();
  if (reading.verdict === 'unreadable') return {
    verdict: 'dead', generation: newest, record: null, unreadableProblem: reading.problem
  };
  const record = reading.verdict === 'readable' ? reading.record : null;
  if (record !== null && hephaestusLockNamesALiveProcess(ports, record)) return { verdict: 'live', generation: newest, record };
  return { verdict: 'dead', generation: newest, record };
}

function newerGenerationExists(hephaestusDirectory: string, generation: number): boolean {
  return generationsIn(hephaestusDirectory).some((existing) => existing > generation);
}

/** Only ever below a generation this process created and still holds as the newest. */
function removeGenerationsBelow(hephaestusDirectory: string, generation: number): void {
  for (const existing of generationsIn(hephaestusDirectory)) {
    if (existing >= generation) continue;
    try {
      unlinkSync(filePathFor(hephaestusDirectory, existing));
    } catch {
      // Another holder's cleanup may have removed it first.
    }
  }
}

/** A Hephaestus lock that cannot be created whole, as where hard links fail, is refused in words rather than thrown as the raw failure. */
function createHephaestusLockWhole(hephaestusDirectory: string, generation: number, record: HephaestusLockRecord, fileReplace: FileReplace): ExclusiveCreation {
  const hephaestusLockFilePath = filePathFor(hephaestusDirectory, generation);
  try {
    return createHephaestusLockWriter(hephaestusLockFilePath, fileReplace).createWhole(record);
  } catch (failure) {
    throw new OperationRefusal('refused', { kind: 'hephaestus-lock-not-created-whole', hephaestusLockFilePath, reason: String(failure) });
  }
}

function staleTakenOverOf(hephaestusDirectory: string, dead: Extract<HephaestusLockReading, { verdict: 'dead' }>): StaleHephaestusLockTakenOver {
  const hephaestusLockFilePath = filePathFor(hephaestusDirectory, dead.generation);
  if (dead.record === null) return { hephaestusLockFilePath, reason: { kind: 'unreadable', problem: dead.unreadableProblem ?? null } };
  return { hephaestusLockFilePath, reason: { kind: 'holder-gone', processId: dead.record.processId } };
}

/**
 * The generation after the newest is created only once the newest names a dead process, and whoever creates it holds the Hephaestus lock unless a
 * newer one already exists: two starters after a reboot both judge the old Hephaestus lock dead, and exactly one of them drives.
 */
function acquire(ports: PlatformPorts, hephaestusDirectory: string, record: HephaestusLockRecord, fileReplace = fileReplaceOfThisProcess()): HephaestusLockAcquisition {
  const newest = newestOf(ports, hephaestusDirectory);
  if (newest.verdict === 'live') return { verdict: 'already-running', generation: newest.generation, record: newest.record };
  const claimed = newest.verdict === 'none' ? 1 : newest.generation + 1;
  if (createHephaestusLockWhole(hephaestusDirectory, claimed, record, fileReplace) === 'already-exists') {
    return { verdict: 'contended' };
  }
  if (newerGenerationExists(hephaestusDirectory, claimed)) return { verdict: 'contended' };
  removeGenerationsBelow(hephaestusDirectory, claimed);
  if (newest.verdict === 'none') return { verdict: 'acquired', generation: claimed };
  return { verdict: 'acquired', generation: claimed, staleTakenOver: staleTakenOverOf(hephaestusDirectory, newest) };
}

/** Run before each effect batch: a Hephaestus whose generation was overtaken stops `hephaestus-lock-taken` without acting. */
function requireNewestGeneration(hephaestusDirectory: string, heldGeneration: number): void {
  if (newerGenerationExists(hephaestusDirectory, heldGeneration)) {
    throw new OperationRefusal('unrepaired', { kind: 'hephaestus-lock-taken', hephaestusLockFilePath: filePathFor(hephaestusDirectory, heldGeneration) });
  }
}

/** The holder's last act at a stop: its own generation goes, and nothing a newer Hephaestus created is touched. */
function release(hephaestusDirectory: string, heldGeneration: number): void {
  if (newerGenerationExists(hephaestusDirectory, heldGeneration)) return;
  try {
    unlinkSync(filePathFor(hephaestusDirectory, heldGeneration));
  } catch {
    // Already gone: nothing is held any more.
  }
}

export const HephaestusLock = Object.freeze({
  acquire,
  release,
  requireNewestGeneration,
  newestOf,
  filePathFor,
  generationsIn,
});
