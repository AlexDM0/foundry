/**
 * `presence.json` and `heartbeat.json` under the board's `overseer` folder: a generation's start, its abandoned passes and how it ended, and
 * its beats at each renewal Talos confirmed. Every write is synchronous and atomic, so a dying process can still make it; a read is a verdict.
 */
import { readFileSync } from 'node:fs';

import { writeFileAtomically }        from '../../lib/atomic-file/AtomicFile.ts';
import { errorCodeOf }                from '../../lib/atomic-file/HeldFileFailure.ts';
import { JsonRecordUtil }             from '../../lib/json-record/JsonRecordUtil.ts';
import { storedIdentityOf }           from '../../lib/process-identity/ProcessIdentity.ts';
import { START_KINDS, START_ORIGINS } from '../../lib/tracker-model/constants/JobStates.ts';
import type {
  AbandonedPassReason,
  HeartbeatRecord,
  HeartbeatWrite,
  PresenceEnding,
  PresenceEndingToWrite,
  PresenceFileReading,
  PresenceRecord,
  PresenceStart,
  PresenceUpdate
} from './@types/PresenceRecord.ts';
import type { StartClassificationVerdict }                   from './@types/StartClassification.ts';
import type { OverseerFiles }                                from './OverseerFiles.ts';
import { HEARTBEAT_FORMAT_VERSION, PRESENCE_FORMAT_VERSION } from './constants/PresenceLimits.ts';

type Fields = Readonly<Record<string, unknown>>;

const MISSING_FILE_CODE = 'ENOENT';

const ABANDONED_PASS_REASONS = Object.keys({ 'tracker-lock-held': true, 'lock-taken-over': true } satisfies Record<AbandonedPassReason, true>) as readonly AbandonedPassReason[];

const CRASHED_COMPONENTS = ['overseer', 'talos'] as const;

const PREVIOUS_ENDINGS = ['stopped', 'handed-over', 'crashed'] as const;

const PRESENCE_READINGS = ['absent', 'unreadable', 'read'] as const;

const TALOS_EVIDENCE = ['none', 'quit', 'live', 'lost-this-boot', 'lost-other-boot'] as const;

function ownFieldOf(fields: Fields, key: string): unknown {
  return Object.hasOwn(fields, key) ? fields[key] : undefined;
}

function isWholeNumberAtLeast(value: unknown, least: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= least;
}

function isOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isWholeNumberOrNull(value: unknown): value is number | null {
  return value === null || isWholeNumberAtLeast(value, 0);
}

/** The parsed object of a stored file of `currentVersion` under `versionKey`; another version is unreadable, as nothing older is read. */
function storedFieldsIn(filePath: string, versionKey: string, currentVersion: number): PresenceFileReading<Fields> {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
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
  const storedVersion = ownFieldOf(parsed, versionKey);
  if (storedVersion !== currentVersion) return { verdict: 'unreadable', reason: `${versionKey} ${String(storedVersion)} is not ${currentVersion}` };
  return { verdict: 'read', record: parsed };
}

function endingOf(value: unknown): PresenceEnding | null | undefined {
  if (value === null) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const kind = ownFieldOf(value, 'kind');
  const at = ownFieldOf(value, 'at');
  if (typeof at !== 'string') return undefined;
  if (kind === 'stopped' || kind === 'handed-over') return { kind, at };
  if (kind !== 'crashed') return undefined;
  const component = ownFieldOf(value, 'component');
  const crashLogGeneration = ownFieldOf(value, 'crashLogGeneration');
  if (!isOneOf(component, CRASHED_COMPONENTS) || !isWholeNumberAtLeast(crashLogGeneration, 1)) return undefined;
  return {
    kind, component, crashLogGeneration, at
  };
}

function evidenceIsWellFormed(value: unknown): boolean {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return false;
  const field = (key: keyof StartClassificationVerdict['evidence']): unknown => ownFieldOf(value, key);
  const previousEnding = field('previousEnding');
  return isOneOf(field('presence'), PRESENCE_READINGS)
    && (previousEnding === null || isOneOf(previousEnding, PREVIOUS_ENDINGS))
    && isTextOrNull(field('previousBootIdentity'))
    && typeof field('currentBootIdentity') === 'string'
    && typeof field('newerBatonThanPresence') === 'boolean'
    && isOneOf(field('talos'), TALOS_EVIDENCE)
    && isTextOrNull(field('lastHeartbeatAt'))
    && isTextOrNull(field('bootStartedAt'));
}

function startClassificationOf(value: unknown): StartClassificationVerdict | null | undefined {
  if (value === null) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const field = (key: keyof StartClassificationVerdict): unknown => ownFieldOf(value, key);
  const crashedComponent = field('crashedComponent');
  const wellFormed = isOneOf(field('kind'), START_KINDS)
    && isWholeNumberOrNull(field('previousGeneration'))
    && typeof field('crashSuspected') === 'boolean'
    && (crashedComponent === null || isOneOf(crashedComponent, CRASHED_COMPONENTS))
    && evidenceIsWellFormed(field('evidence'));
  return wellFormed ? value as unknown as StartClassificationVerdict : undefined;
}

function abandonedPassesOf(value: unknown): PresenceRecord['abandonedPasses'] | undefined {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const inARow = ownFieldOf(value, 'inARow');
  const last = ownFieldOf(value, 'last');
  if (!isWholeNumberAtLeast(inARow, 0)) return undefined;
  if (last === null) return { inARow, last: null };
  if (!JsonRecordUtil.valueIsAPlainObject(last)) return undefined;
  const reason = ownFieldOf(last, 'reason');
  const detail = ownFieldOf(last, 'detail');
  const at = ownFieldOf(last, 'at');
  if (!isOneOf(reason, ABANDONED_PASS_REASONS) || typeof detail !== 'string' || typeof at !== 'string') return undefined;
  return { inARow, last: { reason, detail, at } };
}

function readPresence(files: OverseerFiles): PresenceFileReading<PresenceRecord> {
  const stored = storedFieldsIn(files.presenceFilePath, 'presenceVersion', PRESENCE_FORMAT_VERSION);
  if (stored.verdict !== 'read') return stored;
  const field = (key: keyof PresenceRecord): unknown => ownFieldOf(stored.record, key);
  const unreadable = (reason: string): PresenceFileReading<PresenceRecord> => ({ verdict: 'unreadable', reason });
  const generation = field('generation');
  const storedProcess = field('process');
  const processIdentity = storedIdentityOf(storedProcess);
  const codeVersion = field('codeVersion');
  const startOrigin = field('startOrigin');
  const startedAt = field('startedAt');
  const startClassification = startClassificationOf(field('startClassification'));
  const abandonedPasses = abandonedPassesOf(field('abandonedPasses'));
  const ending = endingOf(field('ending'));
  if (!isWholeNumberAtLeast(generation, 1)) return unreadable('generation is not a whole number from 1');
  if (processIdentity === null || !Object.hasOwn(storedProcess as object, 'startStamp')) return unreadable('process is not a process identity');
  if (typeof codeVersion !== 'string') return unreadable('codeVersion is not a string');
  if (!isOneOf(startOrigin, START_ORIGINS)) return unreadable('startOrigin is not a start origin');
  if (typeof startedAt !== 'string') return unreadable('startedAt is not a string');
  if (startClassification === undefined) return unreadable('startClassification is neither null nor a start classification');
  if (abandonedPasses === undefined) return unreadable('abandonedPasses is not a count with its last abandoned pass');
  if (ending === undefined) return unreadable('ending is neither null nor an ending');
  return {
    verdict: 'read',
    record:  {
      presenceVersion: PRESENCE_FORMAT_VERSION,
      generation,
      process:         processIdentity,
      codeVersion,
      startOrigin,
      startedAt,
      startClassification,
      abandonedPasses,
      ending,
    },
  };
}

function storedTextOf(record: object): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** Overwrites the previous generation's record, which the start's classification has already read. */
function writeStartedPresence(files: OverseerFiles, start: PresenceStart): PresenceRecord {
  const record: PresenceRecord = {
    presenceVersion: PRESENCE_FORMAT_VERSION,
    ...start,
    abandonedPasses: { inARow: 0, last: null },
    ending:          null,
  };
  writeFileAtomically(files.presenceFilePath, storedTextOf(record));
  return record;
}

/** Reads the record, changes it only while it is still `generation`'s, and writes it back whole. */
function updatePresence(files: OverseerFiles, generation: number, change: (record: PresenceRecord) => PresenceRecord | null): PresenceUpdate {
  const reading = readPresence(files);
  if (reading.verdict !== 'read') return { verdict: 'no-record', reading };
  if (reading.record.generation !== generation) return { verdict: 'not-this-generation', storedGeneration: reading.record.generation };
  const changed = change(reading.record);
  if (changed === null) return { verdict: 'unchanged' };
  writeFileAtomically(files.presenceFilePath, storedTextOf(changed));
  return { verdict: 'written', record: changed };
}

function writeEnding(files: OverseerFiles, generation: number, ending: PresenceEndingToWrite, at: string): PresenceUpdate {
  return updatePresence(files, generation, (record) => ({ ...record, ending: { ...ending, at } }));
}

function recordAbandonedPass(files: OverseerFiles, generation: number, reason: AbandonedPassReason, detail: string, at: string): PresenceUpdate {
  return updatePresence(files, generation, (record) => ({
    ...record,
    abandonedPasses: { inARow: record.abandonedPasses.inARow + 1, last: { reason, detail, at } },
  }));
}

/** Writes only when abandoned passes stood in a row, so a pass that follows a completed one rewrites nothing; the last one stays shown. */
function recordCompletedPass(files: OverseerFiles, generation: number): PresenceUpdate {
  return updatePresence(files, generation, (record) => {
    if (record.abandonedPasses.inARow === 0) return null;
    return { ...record, abandonedPasses: { ...record.abandonedPasses, inARow: 0 } };
  });
}

function readHeartbeat(files: OverseerFiles): PresenceFileReading<HeartbeatRecord> {
  const stored = storedFieldsIn(files.heartbeatFilePath, 'heartbeatVersion', HEARTBEAT_FORMAT_VERSION);
  if (stored.verdict !== 'read') return stored;
  const generation = ownFieldOf(stored.record, 'generation');
  const sequence = ownFieldOf(stored.record, 'sequence');
  const at = ownFieldOf(stored.record, 'at');
  if (!isWholeNumberAtLeast(generation, 1)) return { verdict: 'unreadable', reason: 'generation is not a whole number from 1' };
  if (!isWholeNumberAtLeast(sequence, 1)) return { verdict: 'unreadable', reason: 'sequence is not a whole number from 1' };
  if (typeof at !== 'string') return { verdict: 'unreadable', reason: 'at is not a string' };
  return {
    verdict: 'read',
    record:  {
      heartbeatVersion: HEARTBEAT_FORMAT_VERSION, generation, sequence, at
    },
  };
}

/**
 * During a Baton pass the predecessor and the successor both beat: a process beats only while the stored beat's generation is not above its
 * own, so the old generation's last beat never hides the new one's.
 */
function writeHeartbeat(files: OverseerFiles, generation: number, at: string): HeartbeatWrite {
  const stored = readHeartbeat(files);
  const storedGeneration = stored.verdict === 'read' ? stored.record.generation : null;
  if (storedGeneration !== null && storedGeneration > generation) return { verdict: 'newer-generation-beats', storedGeneration };
  const sequence = stored.verdict === 'read' && storedGeneration === generation ? stored.record.sequence + 1 : 1;
  const record: HeartbeatRecord = {
    heartbeatVersion: HEARTBEAT_FORMAT_VERSION, generation, sequence, at
  };
  writeFileAtomically(files.heartbeatFilePath, storedTextOf(record));
  return { verdict: 'written', record };
}

export const Presence = Object.freeze({
  readPresence,
  writeStartedPresence,
  writeEnding,
  readHeartbeat,
  writeHeartbeat,
  recordAbandonedPass,
  recordCompletedPass,
});
