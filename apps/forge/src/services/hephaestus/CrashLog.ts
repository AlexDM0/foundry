/**
 * The board's crash logs, `crash-logs/crash-<number>.json`: one immutable file per crash, assembled from plain values the caller read, and
 * listed and read back as verdicts. Hephaestus lock generations start again at 1 after a stop, so a log is numbered one above the highest on disk, and
 * the Hephaestus lock generation is a field inside it. A crash already logged as the newest log is not logged again, and the file is created
 * exclusively, so a racing second writer of the same crash finds the first log whole.
 */
import {
  closeSync,
  fstatSync,
  openSync,
  readdirSync,
  readSync
} from 'node:fs';
import { join } from 'node:path';

import type { CrashLogProblem } from '../../adapters/crash-log/@types/CrashLogProblem.ts';
import type {
  CrashErrorOrigin,
  CrashLogError,
  CrashLogJob,
  CrashLogRecord
} from '../../adapters/crash-log/@types/CrashLogRecord.ts';
import { CrashLogIngestion }                                                                  from '../../adapters/crash-log/CrashLogIngestion.ts';
import { createCrashLogWriter }                                                               from '../../adapters/crash-log/CrashLogWriter.ts';
import { CRASH_LOG_FORMAT_VERSION }                                                           from '../../adapters/crash-log/constants/CrashLogFileVersions.ts';
import type { ProcessIdentity }                                                               from '../../lib/process-identity/ProcessIdentity.ts';
import type { Job }                                                                           from '../../lib/tracker-model/@types/Job.ts';
import type { CrashLogInputs, CrashLogWrite }                                                 from './@types/CrashLogRecord.ts';
import type { PresenceFileReading }                                                           from './@types/PresenceRecord.ts';
import type { HephaestusFiles }                                                               from './HephaestusFiles.ts';
import type { UnreadableBoardFiles }                                                          from './UnreadableBoardFiles.ts';
import { CRASH_LOG_CREATION_ATTEMPTS, CRASH_LOG_TAIL_LINES, CRASH_LOG_TAIL_READ_BOUND_BYTES } from './constants/PresenceLimits.ts';

const CRASH_LOG_FILE_PATTERN = /^crash-(?<crashLogNumber>[1-9]\d*)\.json$/;

function pathOf(files: HephaestusFiles, crashLogNumber: number): string {
  return join(files.crashLogDirectory, `crash-${crashLogNumber}.json`);
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** A thrown value of any shape, kept as its name, message and stack. */
function errorOf(origin: CrashErrorOrigin, thrown: unknown): CrashLogError {
  if (thrown instanceof Error) return {
    origin, name: thrown.name, message: thrown.message, stack: textOrNull(thrown.stack)
  };
  return {
    origin, name: typeof thrown, message: String(thrown), stack: null
  };
}

function activeJobOf(job: Readonly<Job>): CrashLogJob {
  return {
    jobId:         job.id,
    kind:          job.kind,
    role:          job.role,
    ticketIds:     [...job.ticketIds],
    state:         job.state,
    interruption:  job.interruption ?? null,
    instance:      job.childInstance,
    airlockPhase:  job.airlock?.phase ?? null,
    eventSequence: job.eventCursor.sequence,
  };
}

function assemble(inputs: CrashLogInputs): CrashLogRecord {
  const { presence, heartbeat } = inputs;
  return {
    crashLogVersion:   CRASH_LOG_FORMAT_VERSION,
    crashedGeneration: inputs.crashedGeneration,
    component:         inputs.component,
    suspected:         inputs.suspected,
    classification:    inputs.classification,
    recordedAt:        inputs.recordedAt,
    recordedBy:        inputs.recordedBy,
    crashedProcess:    presence?.process ?? inputs.hephaestusLockHolder,
    codeVersion:       presence?.codeVersion ?? null,
    startedAt:         presence?.startedAt ?? null,
    lastHeartbeat:     heartbeat === null ? null : { sequence: heartbeat.sequence, at: heartbeat.at },
    error:             inputs.error,
    activeJobs:        inputs.activeJobs,
    talosChildren:     inputs.talosChildren,
    logTail:           inputs.logTail,
  };
}

/** Every crash log's number, ascending; a file of another name is not a crash log. */
function list(files: HephaestusFiles): number[] {
  let names: string[];
  try {
    names = readdirSync(files.crashLogDirectory);
  } catch {
    return [];
  }
  return names
    .flatMap((name) => {
      const crashLogNumber = CRASH_LOG_FILE_PATTERN.exec(name)?.groups?.['crashLogNumber'];
      return crashLogNumber === undefined ? [] : [Number(crashLogNumber)];
    })
    .sort((a, b) => a - b);
}

function read(files: HephaestusFiles, crashLogNumber: number): PresenceFileReading<CrashLogRecord, CrashLogProblem> {
  const reading = new CrashLogIngestion(pathOf(files, crashLogNumber)).read();
  return reading.verdict === 'readable' ? { verdict: 'read', record: reading.record } : reading;
}

/** A crash log is board-wide evidence that never heals, so Hephaestus warns in the board header of one it cannot read until it restarts. */
function reportUnreadable(reading: PresenceFileReading<CrashLogRecord, CrashLogProblem>, crashLogNumber: number, unreadableBoardFiles: UnreadableBoardFiles): void {
  if (reading.verdict === 'unreadable') {
    unreadableBoardFiles.report({ file: `hephaestus/crash-logs/crash-${crashLogNumber}.json`, problem: reading.problem });
  }
}

function sameProcessIdentity(stored: ProcessIdentity | null, candidate: ProcessIdentity | null): boolean {
  if (stored === null || candidate === null) return stored === candidate;
  return stored.processId === candidate.processId && stored.startStamp === candidate.startStamp && stored.bootIdentity === candidate.bootIdentity;
}

/**
 * The same crash: the same generation of the same process. A crash whose process nothing names is the same only when the start read the same
 * evidence, as a second start of an unchanged board does.
 */
type CrashIdentity = Pick<CrashLogRecord, 'crashedGeneration' | 'crashedProcess' | 'classification'>;

function recordsTheSameCrash(stored: PresenceFileReading<CrashLogRecord, CrashLogProblem>, candidate: CrashIdentity): boolean {
  if (stored.verdict !== 'read') return false;
  const { record } = stored;
  if (record.crashedGeneration !== candidate.crashedGeneration || !sameProcessIdentity(record.crashedProcess, candidate.crashedProcess)) return false;
  return candidate.crashedProcess !== null || JSON.stringify(record.classification) === JSON.stringify(candidate.classification);
}

/**
 * Only the newest log can be this crash's: another crash needs a start that served in between. An unreadable newest log is reported and
 * read as another crash's, so this crash is logged anew rather than lost.
 */
function newestLogOfTheSameCrash(files: HephaestusFiles, crash: CrashIdentity, unreadableBoardFiles: UnreadableBoardFiles): number | null {
  const newestNumber = list(files).at(-1);
  if (newestNumber === undefined) return null;
  const newest = read(files, newestNumber);
  reportUnreadable(newest, newestNumber, unreadableBoardFiles);
  return recordsTheSameCrash(newest, crash) ? newestNumber : null;
}

/**
 * The next number is one above the highest on disk, so removing older logs frees no number; once the folder is emptied, numbering starts
 * again at 1, as nothing names a removed log.
 */
function writeOnce(files: HephaestusFiles, record: CrashLogRecord, unreadableBoardFiles: UnreadableBoardFiles): CrashLogWrite {
  for (let attempt = 0; attempt < CRASH_LOG_CREATION_ATTEMPTS; attempt++) {
    const alreadyWritten = newestLogOfTheSameCrash(files, record, unreadableBoardFiles);
    if (alreadyWritten !== null) return { verdict: 'already-written', crashLogNumber: alreadyWritten };
    const newestNumber = list(files).at(-1) ?? 0;
    const crashLogNumber = newestNumber + 1;
    if (createCrashLogWriter(pathOf(files, crashLogNumber)).create(record) === 'created') return { verdict: 'written', crashLogNumber };
  }
  throw new Error(`No crash log number was free after ${CRASH_LOG_CREATION_ATTEMPTS} attempts in ${files.crashLogDirectory}.`);
}

/** The last bytes of the file up to a bound, never the whole of a large log; a line the bound cut into is left out. */
function endOfFileText(filePath: string): string {
  const fileDescriptor = openSync(filePath, 'r');
  try {
    const { size } = fstatSync(fileDescriptor);
    const start = Math.max(0, size - CRASH_LOG_TAIL_READ_BOUND_BYTES);
    const buffer = Buffer.alloc(size - start);
    let filled = 0;
    while (filled < buffer.length) {
      const readBytes = readSync(fileDescriptor, buffer, filled, buffer.length - filled, start + filled);
      if (readBytes === 0) break;
      filled += readBytes;
    }
    const text = buffer.subarray(0, filled).toString('utf8');
    if (start === 0) return text;
    const firstWholeLineStart = text.indexOf('\n') + 1;
    return firstWholeLineStart === 0 ? '' : text.slice(firstWholeLineStart);
  } finally {
    closeSync(fileDescriptor);
  }
}

/** The last `lineCount` lines of the log; `null` when it cannot be read, never a throw. */
function logTailOf(logFilePath: string, lineCount: number = CRASH_LOG_TAIL_LINES): string[] | null {
  let text: string;
  try {
    text = endOfFileText(logFilePath);
  } catch {
    return null;
  }
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.slice(-lineCount);
}

export const CrashLog = Object.freeze({
  pathOf,
  errorOf,
  activeJobOf,
  assemble,
  writeOnce,
  newestLogOfTheSameCrash,
  list,
  read,
  reportUnreadable,
  logTailOf,
});
