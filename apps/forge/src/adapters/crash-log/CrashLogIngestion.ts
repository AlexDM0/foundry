/** `hephaestus/crash-logs/crash-<number>.json`, the record of one crash: read, validate every field, map. */
import { JsonRecordUtil }         from '../../lib/json-record/JsonRecordUtil.ts';
import { storedIdentityOf }       from '../../lib/process-identity/ProcessIdentity.ts';
import { START_ORIGINS }          from '../../lib/tracker-model/constants/JobStates.ts';
import { startClassificationOf }  from '../presence/PresenceIngestion.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }        from '../utils/StoredValueUtil.ts';
import type {
  CrashErrorOrigin,
  CrashLogError,
  CrashLogJob,
  CrashLogRecord
} from './@types/CrashLogRecord.ts';
import { CRASH_LOG_FORMAT_VERSION } from './constants/CrashLogFileVersions.ts';

export type CrashLogReading =
  | { verdict: 'readable'; record: CrashLogRecord }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

type Fields = Readonly<Record<string, unknown>>;

const CRASH_LOG_VERSION_KEY = 'crashLogVersion';

const CRASH_LOG_COMPONENTS = ['hephaestus', 'talos', 'unknown'] as const;

const CRASH_ERROR_ORIGINS = Object.keys({
  'pass': true, 'uncaught-exception': true, 'unhandled-rejection': true, 'talos-lost': true
} satisfies Record<CrashErrorOrigin, true>) as readonly CrashErrorOrigin[];

function ownFieldOf(fields: Fields, key: string): unknown {
  return Object.hasOwn(fields, key) ? fields[key] : undefined;
}

function isOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isGenerationOrNull(value: unknown): value is number | null {
  return value === null || StoredValueUtil.wholeNumberIsAtLeast(value, 1);
}

function recordedByOf(value: unknown): CrashLogRecord['recordedBy'] | undefined {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const generation = ownFieldOf(value, 'generation');
  const startOrigin = ownFieldOf(value, 'startOrigin');
  const crashPath = ownFieldOf(value, 'crashPath');
  if (!isGenerationOrNull(generation) || !(startOrigin === null || isOneOf(startOrigin, START_ORIGINS)) || typeof crashPath !== 'boolean') return undefined;
  return { generation, startOrigin, crashPath };
}

function lastHeartbeatOf(value: unknown): CrashLogRecord['lastHeartbeat'] | undefined {
  if (value === null) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const sequence = ownFieldOf(value, 'sequence');
  const at = ownFieldOf(value, 'at');
  return StoredValueUtil.wholeNumberIsAtLeast(sequence, 1) && typeof at === 'string' ? { sequence, at } : undefined;
}

function errorOf(value: unknown): CrashLogError | null | undefined {
  if (value === null) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const origin = ownFieldOf(value, 'origin');
  const name = ownFieldOf(value, 'name');
  const message = ownFieldOf(value, 'message');
  const stack = ownFieldOf(value, 'stack');
  if (!isOneOf(origin, CRASH_ERROR_ORIGINS) || typeof name !== 'string' || typeof message !== 'string' || !isTextOrNull(stack)) return undefined;
  return {
    origin, name, message, stack
  };
}

function activeJobOf(value: unknown): CrashLogJob | undefined {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const field = (key: keyof CrashLogJob): unknown => ownFieldOf(value, key);
  const ticketIds = field('ticketIds');
  const wellFormed = typeof field('jobId') === 'string' && typeof field('kind') === 'string' && isTextOrNull(field('role'))
    && Array.isArray(ticketIds) && ticketIds.every((ticketId) => typeof ticketId === 'string') && typeof field('state') === 'string'
    && isTextOrNull(field('interruption')) && StoredValueUtil.wholeNumberIsAtLeast(field('instance'), 0) && isTextOrNull(field('airlockPhase'))
    && StoredValueUtil.wholeNumberIsAtLeast(field('eventSequence'), 0);
  return wellFormed ? value as unknown as CrashLogJob : undefined;
}

function activeJobsOf(value: unknown): CrashLogJob[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const jobs = value.map(activeJobOf);
  return jobs.every((job) => job !== undefined) ? jobs as CrashLogJob[] : undefined;
}

function logTailOf(value: unknown): string[] | null | undefined {
  if (value === null) return null;
  return Array.isArray(value) && value.every((line) => typeof line === 'string') ? value as string[] : undefined;
}

function crashedProcessOf(value: unknown): CrashLogRecord['crashedProcess'] | undefined {
  if (value === null) return null;
  return storedIdentityOf(value) ?? undefined;
}

function crashLogReadingOf(document: Fields): CrashLogReading {
  const field = (key: keyof CrashLogRecord): unknown => ownFieldOf(document, key);
  const unreadable = (reason: string): CrashLogReading => ({ verdict: 'unreadable', reason });
  const crashedGeneration = field('crashedGeneration');
  const component = field('component');
  const suspected = field('suspected');
  const classification = startClassificationOf(field('classification'));
  const recordedAt = field('recordedAt');
  const recordedBy = recordedByOf(field('recordedBy'));
  const crashedProcess = crashedProcessOf(field('crashedProcess'));
  const codeVersion = field('codeVersion');
  const startedAt = field('startedAt');
  const lastHeartbeat = lastHeartbeatOf(field('lastHeartbeat'));
  const error = errorOf(field('error'));
  const activeJobs = activeJobsOf(field('activeJobs'));
  const talosChildren = field('talosChildren');
  const logTail = logTailOf(field('logTail'));
  if (!isGenerationOrNull(crashedGeneration)) return unreadable('crashedGeneration is not a generation or null');
  if (!isOneOf(component, CRASH_LOG_COMPONENTS)) return unreadable('component is not a crashed component');
  if (typeof suspected !== 'boolean') return unreadable('suspected is not a flag');
  if (classification === undefined) return unreadable('classification is neither null nor a start classification');
  if (typeof recordedAt !== 'string') return unreadable('recordedAt is not a string');
  if (recordedBy === undefined) return unreadable('recordedBy is not who recorded the crash');
  if (crashedProcess === undefined) return unreadable('crashedProcess is neither null nor a process identity');
  if (!isTextOrNull(codeVersion) || !isTextOrNull(startedAt)) return unreadable('codeVersion and startedAt are each a string or null');
  if (lastHeartbeat === undefined) return unreadable('lastHeartbeat is neither null nor a beat');
  if (error === undefined) return unreadable('error is neither null nor a crash error');
  if (activeJobs === undefined) return unreadable('activeJobs is neither null nor a list of jobs');
  if (!(talosChildren === null || Array.isArray(talosChildren))) return unreadable('talosChildren is neither null nor a list');
  if (logTail === undefined) return unreadable('logTail is neither null nor a list of lines');
  return {
    verdict: 'readable',
    record:  {
      crashLogVersion: CRASH_LOG_FORMAT_VERSION,
      crashedGeneration,
      component,
      suspected,
      classification,
      recordedAt,
      recordedBy,
      crashedProcess,
      codeVersion,
      startedAt,
      lastHeartbeat,
      error,
      activeJobs,
      talosChildren,
      logTail,
    },
  };
}

export class CrashLogIngestion {
  constructor(private readonly crashLogFilePath: string) {}

  /** Never throws: a log of another `crashLogVersion` is unreadable, as nothing older is read. */
  read(): CrashLogReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.crashLogFilePath, CRASH_LOG_FORMAT_VERSION, CRASH_LOG_VERSION_KEY);
    if (stored.verdict !== 'readable') return stored;
    return crashLogReadingOf(stored.document);
  }
}
