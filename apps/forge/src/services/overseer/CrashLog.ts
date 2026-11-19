/**
 * The board's crash logs, `crash-logs/crash-<generation>.json`: one immutable file per crash, assembled from plain values the caller read, created
 * exclusively so a racing second writer leaves the first log whole, and listed and read back as verdicts.
 */
import {
  closeSync,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync
} from 'node:fs';
import { join } from 'node:path';

import { createWholeFileAtomically } from '../../lib/atomic-file/AtomicFile.ts';
import type { ExclusiveCreation }    from '../../lib/atomic-file/FileReplace.ts';
import { errorCodeOf }               from '../../lib/atomic-file/HeldFileFailure.ts';
import { JsonRecordUtil }            from '../../lib/json-record/JsonRecordUtil.ts';
import type { Job }                  from '../../lib/tracker-model/@types/Job.ts';
import type {
  CrashErrorOrigin,
  CrashLogError,
  CrashLogInputs,
  CrashLogJob,
  CrashLogRecord
} from './@types/CrashLogRecord.ts';
import type { PresenceFileReading }                                                        from './@types/PresenceRecord.ts';
import type { OverseerFiles }                                                              from './OverseerFiles.ts';
import { CRASH_LOG_FORMAT_VERSION, CRASH_LOG_TAIL_LINES, CRASH_LOG_TAIL_READ_BOUND_BYTES } from './constants/PresenceLimits.ts';

const CRASH_LOG_FILE_PATTERN = /^crash-(?<generation>[1-9]\d*)\.json$/;

const MISSING_FILE_CODE = 'ENOENT';

const CRASH_LOG_COMPONENTS = ['overseer', 'talos', 'unknown'] as const;

function pathOf(files: OverseerFiles, generation: number): string {
  return join(files.crashLogDirectory, `crash-${generation}.json`);
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
    crashedProcess:    presence?.process ?? null,
    codeVersion:       presence?.codeVersion ?? null,
    startedAt:         presence?.startedAt ?? null,
    lastHeartbeat:     heartbeat === null ? null : { sequence: heartbeat.sequence, at: heartbeat.at },
    error:             inputs.error,
    activeJobs:        inputs.activeJobs,
    talosChildren:     inputs.talosChildren,
    logTail:           inputs.logTail,
  };
}

/** The file is never rewritten: a second writer of the same generation is answered `already-exists` and the first log stays. */
function writeOnce(files: OverseerFiles, record: CrashLogRecord): ExclusiveCreation {
  return createWholeFileAtomically(pathOf(files, record.crashedGeneration), `${JSON.stringify(record, null, 2)}\n`);
}

/** Every crash log's generation, ascending; a file of another name is not a crash log. */
function list(files: OverseerFiles): number[] {
  let names: string[];
  try {
    names = readdirSync(files.crashLogDirectory);
  } catch {
    return [];
  }
  return names
    .flatMap((name) => {
      const generation = CRASH_LOG_FILE_PATTERN.exec(name)?.groups?.['generation'];
      return generation === undefined ? [] : [Number(generation)];
    })
    .sort((a, b) => a - b);
}

function isListOrNull(value: unknown): boolean {
  return value === null || Array.isArray(value);
}

function read(files: OverseerFiles, generation: number): PresenceFileReading<CrashLogRecord> {
  let text: string;
  try {
    text = readFileSync(pathOf(files, generation), 'utf8');
  } catch (failure) {
    if (errorCodeOf(failure) === MISSING_FILE_CODE) return { verdict: 'absent' };
    return { verdict: 'unreadable', reason: `not readable: ${String(failure)}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (failure) {
    return { verdict: 'unreadable', reason: `not JSON: ${String(failure)}` };
  }
  if (!JsonRecordUtil.valueIsAPlainObject(parsed)) return { verdict: 'unreadable', reason: 'not a JSON object' };
  const field = (key: keyof CrashLogRecord): unknown => (Object.hasOwn(parsed, key) ? parsed[key] : undefined);
  const unreadable = (reason: string): PresenceFileReading<CrashLogRecord> => ({ verdict: 'unreadable', reason });
  if (field('crashLogVersion') !== CRASH_LOG_FORMAT_VERSION) return unreadable(`crashLogVersion ${String(field('crashLogVersion'))} is not ${CRASH_LOG_FORMAT_VERSION}`);
  if (field('crashedGeneration') !== generation) return unreadable(`crashedGeneration is not ${generation}`);
  const component = field('component');
  if (typeof component !== 'string' || !(CRASH_LOG_COMPONENTS as readonly string[]).includes(component)) return unreadable('component is not a crashed component');
  if (typeof field('suspected') !== 'boolean') return unreadable('suspected is not a flag');
  if (typeof field('recordedAt') !== 'string') return unreadable('recordedAt is not a string');
  if (!JsonRecordUtil.valueIsAPlainObject(field('recordedBy'))) return unreadable('recordedBy is not an object');
  if (!isListOrNull(field('activeJobs')) || !isListOrNull(field('talosChildren')) || !isListOrNull(field('logTail'))) {
    return unreadable('activeJobs, talosChildren and logTail are each a list or null');
  }
  return { verdict: 'read', record: parsed as unknown as CrashLogRecord };
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
  list,
  read,
  logTailOf,
});
