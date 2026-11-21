/**
 * The one Hephaestus of a board, by generations on the `src/services/tracker/TrackerLock.ts` scheme: each start creates
 * `<data>/hephaestus/baton-<n>.json` exclusively, never rewritten, and the newest generation naming a live process identity is Hephaestus.
 * Nobody unlinks a Baton it does not hold; the holder removes the generations below its own.
 */
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join }                                  from 'node:path';

import { createWholeFileAtomically }                from '../../lib/atomic-file/AtomicFile.ts';
import type { ExclusiveCreation, FileReplace }      from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                 from '../../lib/atomic-file/FileReplaceFor.ts';
import type { PlatformPorts }                       from '../../lib/platform-ports/PlatformPortsFor.ts';
import { type ProcessIdentity, startStampOfStored } from '../../lib/process-identity/ProcessIdentity.ts';
import { OperationRefusal }                         from '../../shared/OperationRefusal.ts';

export interface BatonRecord {
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
 * A Baton that cannot be read names no process, so it reads as dead: it was created whole, and only a damaged file is unreadable. A partial
 * one would hand the Baton to a second Hephaestus, so where hard links fail the claim is refused `baton-not-created-whole`, never created by
 * the open fallback.
 */
export type BatonReading =
  | { verdict: 'none' }
  | { verdict: 'live'; generation: number; record: BatonRecord }
  | { verdict: 'dead'; generation: number; record: BatonRecord | null };

export type BatonAcquisition =
  | { verdict: 'acquired'; generation: number }
  | { verdict: 'already-running'; generation: number; record: BatonRecord }
  | { verdict: 'contended' };

const BATON_FILE_PATTERN = /^baton-(\d+)\.json$/;

const NUMBER_FIELDS = ['processId', 'port', 'installVersion', 'talosProtocolVersion'] as const;
const TEXT_FIELDS   = ['processStartStamp', 'bootIdentity', 'url', 'tokenFile', 'codeVersion'] as const;

function batonFilePathFor(hephaestusDirectory: string, generation: number): string {
  return join(hephaestusDirectory, `baton-${generation}.json`);
}

/** Ascending; an absent folder holds no generation. */
function batonGenerationsIn(hephaestusDirectory: string): number[] {
  let fileNames: string[];
  try {
    fileNames = readdirSync(hephaestusDirectory);
  } catch {
    return [];
  }
  return fileNames
    .map((fileName) => BATON_FILE_PATTERN.exec(fileName)?.[1])
    .filter((digits): digits is string => digits !== undefined)
    .map(Number)
    .filter((generation) => Number.isSafeInteger(generation))
    .sort((a, b) => a - b);
}

function recordIsWellFormed(fields: Record<string, unknown>): boolean {
  return NUMBER_FIELDS.every((field) => typeof fields[field] === 'number') && TEXT_FIELDS.every((field) => typeof fields[field] === 'string');
}

/** A live Hephaestus of the code before the rename names its start `processStartEpochSeconds`, a number; a later reader sees that same process. */
function batonRecordOfStored(parsed: unknown): BatonRecord | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { processStartEpochSeconds, processStartStamp, ...otherFields } = parsed as Record<string, unknown>;
  const fields = { ...otherFields, processStartStamp: startStampOfStored(processStartStamp ?? processStartEpochSeconds) };
  return recordIsWellFormed(fields) ? fields as unknown as BatonRecord : null;
}

function readBatonRecord(batonFilePath: string): BatonRecord | null {
  try {
    return batonRecordOfStored(JSON.parse(readFileSync(batonFilePath, 'utf8')));
  } catch {
    return null;
  }
}

function identityNamedBy(record: BatonRecord): ProcessIdentity {
  return { processId: record.processId, startStamp: record.processStartStamp, bootIdentity: record.bootIdentity };
}

/** Live only while the process the Baton names is still that process: a reused pid or a reboot reads as dead. */
function batonNamesALiveProcess({ processSupervision }: PlatformPorts, record: BatonRecord): boolean {
  const currentIdentity = processSupervision.identityOf(record.processId);
  return currentIdentity !== null && processSupervision.sameProcess(currentIdentity, identityNamedBy(record));
}

function newestBatonOf(ports: PlatformPorts, hephaestusDirectory: string): BatonReading {
  const newest = batonGenerationsIn(hephaestusDirectory).at(-1);
  if (newest === undefined) return { verdict: 'none' };
  const record = readBatonRecord(batonFilePathFor(hephaestusDirectory, newest));
  if (record !== null && batonNamesALiveProcess(ports, record)) return { verdict: 'live', generation: newest, record };
  return { verdict: 'dead', generation: newest, record };
}

function newerGenerationExists(hephaestusDirectory: string, generation: number): boolean {
  return batonGenerationsIn(hephaestusDirectory).some((existing) => existing > generation);
}

/** Only ever below a generation this process created and still holds as the newest. */
function removeGenerationsBelow(hephaestusDirectory: string, generation: number): void {
  for (const existing of batonGenerationsIn(hephaestusDirectory)) {
    if (existing >= generation) continue;
    try {
      unlinkSync(batonFilePathFor(hephaestusDirectory, existing));
    } catch {
      // Another holder's cleanup may have removed it first.
    }
  }
}

/** A Baton that cannot be created whole, as where hard links fail, is refused in words rather than thrown as the raw failure. */
function createBatonWhole(hephaestusDirectory: string, generation: number, record: BatonRecord, fileReplace: FileReplace): ExclusiveCreation {
  const batonFilePath = batonFilePathFor(hephaestusDirectory, generation);
  try {
    return createWholeFileAtomically(batonFilePath, `${JSON.stringify(record, null, 2)}\n`, fileReplace);
  } catch (failure) {
    throw new OperationRefusal('refused', { kind: 'baton-not-created-whole', batonFilePath, reason: String(failure) });
  }
}

/**
 * The generation after the newest is created only once the newest names a dead process, and whoever creates it holds the Baton unless a
 * newer one already exists: two starters after a reboot both judge the old Baton dead, and exactly one of them drives.
 */
function acquire(ports: PlatformPorts, hephaestusDirectory: string, record: BatonRecord, fileReplace = fileReplaceOfThisProcess()): BatonAcquisition {
  const newest = newestBatonOf(ports, hephaestusDirectory);
  if (newest.verdict === 'live') return { verdict: 'already-running', generation: newest.generation, record: newest.record };
  const claimed = newest.verdict === 'none' ? 1 : newest.generation + 1;
  if (createBatonWhole(hephaestusDirectory, claimed, record, fileReplace) === 'already-exists') {
    return { verdict: 'contended' };
  }
  if (newerGenerationExists(hephaestusDirectory, claimed)) return { verdict: 'contended' };
  removeGenerationsBelow(hephaestusDirectory, claimed);
  return { verdict: 'acquired', generation: claimed };
}

/**
 * A Baton pass's claims beside a live identity, which the Baton pass file admits: the successor's generation above the one handed over once it
 * was released, and the old Hephaestus's one above its failed successor's. Anything newer than the floor means another Hephaestus moved first.
 */
function acquireAbove(hephaestusDirectory: string, record: BatonRecord, floorGeneration: number, fileReplace = fileReplaceOfThisProcess()): BatonAcquisition {
  const newest = batonGenerationsIn(hephaestusDirectory).at(-1) ?? 0;
  if (newest > floorGeneration) return { verdict: 'contended' };
  const claimed = floorGeneration + 1;
  if (createBatonWhole(hephaestusDirectory, claimed, record, fileReplace) === 'already-exists') {
    return { verdict: 'contended' };
  }
  if (newerGenerationExists(hephaestusDirectory, claimed)) return { verdict: 'contended' };
  removeGenerationsBelow(hephaestusDirectory, claimed);
  return { verdict: 'acquired', generation: claimed };
}

/** Run before each effect batch: a Hephaestus whose generation was overtaken stops `baton-taken` without acting. */
function requireNewestGeneration(hephaestusDirectory: string, heldGeneration: number): void {
  if (newerGenerationExists(hephaestusDirectory, heldGeneration)) {
    throw new OperationRefusal('unrepaired', { kind: 'baton-taken', batonFilePath: batonFilePathFor(hephaestusDirectory, heldGeneration) });
  }
}

/** The holder's last act at a stop: its own generation goes, and nothing a newer Hephaestus created is touched. */
function release(hephaestusDirectory: string, heldGeneration: number): void {
  if (newerGenerationExists(hephaestusDirectory, heldGeneration)) return;
  try {
    unlinkSync(batonFilePathFor(hephaestusDirectory, heldGeneration));
  } catch {
    // Already gone: nothing is held any more.
  }
}

export const Baton = Object.freeze({
  acquire,
  acquireAbove,
  release,
  requireNewestGeneration,
  newestBatonOf,
  batonFilePathFor,
  batonGenerationsIn,
});
