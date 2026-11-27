/**
 * `child-<instance>.json`, Talos's record of one child: who runs it, how far it got, which endings it recognised and how it ended. Talos
 * replaces it atomically on each change; a reader gets a verdict, never a throw.
 */
import type { ProcessIdentity }                                  from '../process-identity/ProcessIdentity.ts';
import type { RecognisedEnding }                                 from './EndingPatterns.ts';
import { CHILD_RECORD_FORMAT_VERSION, EVENT_LOG_FORMAT_VERSION } from './constants/TalosProtocol.ts';
import { ParsedValueUtil, type StoredRecordReading }             from './utils/ParsedValueUtil.ts';

export type ChildKind = 'agent' | 'line';
export type ChildState = 'starting' | 'running' | 'stopping' | 'ended';
/**
 * `exited` and `signalled` are the child's own end or a requested stop; `paused` a clean quit; `lease-ended` the lease;
 * `time-bound` a line past its bound; `spawn-failed` no child ever ran.
 */
export type ChildEndReason = 'exited' | 'signalled' | 'spawn-failed' | 'paused' | 'lease-ended' | 'time-bound';

export interface ChildEnd {
  reason:          ChildEndReason;
  exitCode:        number | null;
  signal:          string | null;
  /** Why no child ran; `null` when one did. */
  detail:          string | null;
  /**
   * Wall time from the spawn to the end less every gap Talos added to the allowance: the bound's measure. Recorded and
   * shown only; 0 when no child ran.
   */
  runMilliseconds: number;
}

export interface ChildRecord {
  formatVersion:         typeof CHILD_RECORD_FORMAT_VERSION;
  childId:               string;
  kind:                  ChildKind;
  label:                 string;
  /** The launch's working directory: a resumed session starts where its first instance started (`SessionPlace.ts:63-71`). */
  workingDirectory:      string;
  talosStartNumber:      number;
  talos:                 ProcessIdentity | null;
  state:                 ChildState;
  childProcess:          ProcessIdentity | null;
  /** Its group's id on POSIX, the pid alone on Windows. */
  childProcessGroupId:   number | null;
  eventLogFormatVersion: typeof EVENT_LOG_FORMAT_VERSION;
  timeBoundMilliseconds: number | null;
  recognisedEndings:     readonly RecognisedEnding[];
  end:                   ChildEnd | null;
}

export const CHILD_KINDS = Object.keys({ agent: true, line: true } satisfies Record<ChildKind, true>) as readonly ChildKind[];

const CHILD_STATES = Object.keys({
  starting: true, running: true, stopping: true, ended: true
} satisfies Record<ChildState, true>) as readonly ChildState[];

const CHILD_END_REASONS = Object.keys({
  'exited': true, 'signalled': true, 'spawn-failed': true, 'paused': true, 'lease-ended': true, 'time-bound': true
} satisfies Record<ChildEndReason, true>) as readonly ChildEndReason[];

const { ownFieldOf, isWholeNumberAtLeast, isOneOf } = ParsedValueUtil;

function isNullOr<Value>(value: unknown, holds: (item: unknown) => item is Value): value is Value | null {
  return value === null || holds(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isExitCode(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isWholeNumberAboveZero(value: unknown): value is number {
  return isWholeNumberAtLeast(value, 1);
}

function recognisedEndingOf(value: unknown): RecognisedEnding | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const parsed = value as Readonly<Record<string, unknown>>;
  const name = ownFieldOf(parsed, 'name');
  const closingLineSequence = ownFieldOf(parsed, 'closingLineSequence');
  const countedLines = ownFieldOf(parsed, 'countedLines');
  if (typeof name !== 'string' || name === '' || !isWholeNumberAtLeast(closingLineSequence, 1) || !isWholeNumberAtLeast(countedLines, 0)) return null;
  return { name, closingLineSequence, countedLines };
}

function childEndOf(value: unknown): ChildEnd | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const parsed = value as Readonly<Record<string, unknown>>;
  const reason = ownFieldOf(parsed, 'reason');
  const exitCode = ownFieldOf(parsed, 'exitCode');
  const signal = ownFieldOf(parsed, 'signal');
  const detail = ownFieldOf(parsed, 'detail');
  const runMilliseconds = ownFieldOf(parsed, 'runMilliseconds');
  if (!isOneOf(reason, CHILD_END_REASONS) || !isNullOr(exitCode, isExitCode) || !isNullOr(signal, isString) || !isNullOr(detail, isString)) return null;
  if (!isWholeNumberAtLeast(runMilliseconds, 0)) return null;
  return {
    reason, exitCode, signal, detail, runMilliseconds
  };
}

export function childRecordTextOf(record: ChildRecord): string {
  return ParsedValueUtil.storedTextOf(record);
}

export function childRecordOf(text: string): StoredRecordReading<ChildRecord> {
  const reading = ParsedValueUtil.parsedObjectOf(text, CHILD_RECORD_FORMAT_VERSION);
  if (reading.verdict !== 'object') return reading;
  const field = (key: keyof ChildRecord): unknown => ownFieldOf(reading.parsed, key);
  const unreadable = (field: string): StoredRecordReading<ChildRecord> => ({ verdict: 'unreadable', problem: { code: 'field-malformed', field } });
  const childId = field('childId');
  const kind = field('kind');
  const label = field('label');
  const workingDirectory = field('workingDirectory');
  const talosStartNumber = field('talosStartNumber');
  const talos = ParsedValueUtil.identityOrNullOf(field('talos'));
  const state = field('state');
  const childProcess = ParsedValueUtil.identityOrNullOf(field('childProcess'));
  const childProcessGroupId = field('childProcessGroupId');
  const timeBoundMilliseconds = field('timeBoundMilliseconds');
  const storedEndings = field('recognisedEndings');
  const storedEnd = field('end');
  if (typeof childId !== 'string' || childId === '') return unreadable('childId');
  if (!isOneOf(kind, CHILD_KINDS)) return unreadable('kind');
  if (typeof label !== 'string') return unreadable('label');
  if (typeof workingDirectory !== 'string' || workingDirectory === '') return unreadable('workingDirectory');
  if (!isWholeNumberAtLeast(talosStartNumber, 1)) return unreadable('talosStartNumber');
  if (talos === undefined) return unreadable('talos');
  if (!isOneOf(state, CHILD_STATES)) return unreadable('state');
  if (childProcess === undefined) return unreadable('childProcess');
  if (!isNullOr(childProcessGroupId, isWholeNumberAboveZero)) return unreadable('childProcessGroupId');
  if (field('eventLogFormatVersion') !== EVENT_LOG_FORMAT_VERSION) return unreadable('eventLogFormatVersion');
  if (!isNullOr(timeBoundMilliseconds, isWholeNumberAboveZero)) return unreadable('timeBoundMilliseconds');
  const recognisedEndings = Array.isArray(storedEndings) ? storedEndings.map(recognisedEndingOf) : null;
  if (recognisedEndings === null || recognisedEndings.includes(null)) return unreadable('recognisedEndings');
  const end = storedEnd === null ? null : childEndOf(storedEnd);
  if (storedEnd !== null && end === null) return unreadable('end');
  return {
    verdict: 'read',
    record:  {
      formatVersion:         CHILD_RECORD_FORMAT_VERSION,
      childId,
      kind,
      label,
      workingDirectory,
      talosStartNumber,
      talos,
      state,
      childProcess,
      childProcessGroupId,
      eventLogFormatVersion: EVENT_LOG_FORMAT_VERSION,
      timeBoundMilliseconds,
      recognisedEndings:     recognisedEndings.filter((ending) => ending !== null),
      end,
    },
  };
}
