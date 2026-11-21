/**
 * The one Hephaestus of a board, by generations on the `src/services/tracker/TrackerLock.ts` scheme: each start creates
 * `<data>/hephaestus/lock-<n>.json` exclusively, never rewritten, and the newest generation naming a live process identity is Hephaestus.
 * Nobody unlinks a Hephaestus lock it does not hold; the holder removes the generations below its own.
 */
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join }                                  from 'node:path';

import { createWholeFileAtomically }           from '../../lib/atomic-file/AtomicFile.ts';
import type { ExclusiveCreation, FileReplace } from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }            from '../../lib/atomic-file/FileReplaceFor.ts';
import type { PlatformPorts }                  from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                from '../../lib/process-identity/ProcessIdentity.ts';
import { OperationRefusal }                    from '../../shared/OperationRefusal.ts';

export interface HephaestusLockRecord {
  processId:            number;
  processStartStamp:    string;
  bootIdentity:         string;
  port:                 number;
  url:                  string;
  tokenFile:            string;
  codeVersion:          string;
  installVersion:       number;
  talosProtocolVersion: number;
}

/**
 * A Hephaestus lock that cannot be read names no process, so it reads as dead: it was created whole, and only a damaged file is unreadable. A partial
 * one would hand the lock to a second Hephaestus, so where hard links fail the claim is refused `hephaestus-lock-not-created-whole`, never created by
 * the open fallback.
 */
export type HephaestusLockReading =
  | { verdict: 'none' }
  | { verdict: 'live'; generation: number; record: HephaestusLockRecord }
  | { verdict: 'dead'; generation: number; record: HephaestusLockRecord | null };

export type HephaestusLockAcquisition =
  | { verdict: 'acquired'; generation: number }
  | { verdict: 'already-running'; generation: number; record: HephaestusLockRecord }
  | { verdict: 'contended' };

const HEPHAESTUS_LOCK_FILE_PATTERN = /^lock-(\d+)\.json$/;

const NUMBER_FIELDS = ['processId', 'port', 'installVersion', 'talosProtocolVersion'] as const;
const TEXT_FIELDS   = ['processStartStamp', 'bootIdentity', 'url', 'tokenFile', 'codeVersion'] as const;

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

function recordIsWellFormed(fields: Record<string, unknown>): boolean {
  return NUMBER_FIELDS.every((field) => typeof fields[field] === 'number') && TEXT_FIELDS.every((field) => typeof fields[field] === 'string');
}

function hephaestusLockRecordOfStored(parsed: unknown): HephaestusLockRecord | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const fields = parsed as Record<string, unknown>;
  return recordIsWellFormed(fields) ? fields as unknown as HephaestusLockRecord : null;
}

function readHephaestusLockRecord(hephaestusLockFilePath: string): HephaestusLockRecord | null {
  try {
    return hephaestusLockRecordOfStored(JSON.parse(readFileSync(hephaestusLockFilePath, 'utf8')));
  } catch {
    return null;
  }
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
  const record = readHephaestusLockRecord(filePathFor(hephaestusDirectory, newest));
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
    return createWholeFileAtomically(hephaestusLockFilePath, `${JSON.stringify(record, null, 2)}\n`, fileReplace);
  } catch (failure) {
    throw new OperationRefusal('refused', { kind: 'hephaestus-lock-not-created-whole', hephaestusLockFilePath, reason: String(failure) });
  }
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
  return { verdict: 'acquired', generation: claimed };
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
