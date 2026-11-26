/** `hephaestus/presence.json`, a generation's start, its abandoned passes and its ending: read, validate every field, map. */
import { JsonRecordUtil }                                           from '../../lib/json-record/JsonRecordUtil.ts';
import { storedIdentityOf }                                         from '../../lib/process-identity/ProcessIdentity.ts';
import { START_KINDS, START_ORIGINS }                               from '../../lib/tracker-model/constants/JobStates.ts';
import { StoredJsonDocumentUtil }                                   from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }                                          from '../utils/StoredValueUtil.ts';
import type { AbandonedPassReason, PresenceEnding, PresenceRecord } from './@types/PresenceRecord.ts';
import type { StartClassificationVerdict }                          from './@types/StartClassificationVerdict.ts';
import { PRESENCE_FORMAT_VERSION }                                  from './constants/PresenceFileVersions.ts';

export type PresenceReading =
  | { verdict: 'readable'; record: PresenceRecord }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

type Fields = Readonly<Record<string, unknown>>;

export const PRESENCE_VERSION_KEY = 'presenceVersion';

const ABANDONED_PASS_REASONS = Object.keys({ 'tracker-lock-held': true, 'lock-taken-over': true } satisfies Record<AbandonedPassReason, true>) as readonly AbandonedPassReason[];

const CRASHED_COMPONENTS = ['hephaestus', 'talos'] as const;

const PREVIOUS_ENDINGS = ['stopped', 'handed-over', 'crashed'] as const;

const PRESENCE_READINGS = ['absent', 'unreadable', 'read'] as const;

const TALOS_EVIDENCE = ['none', 'quit', 'live', 'lost-this-boot', 'lost-other-boot'] as const;

function ownFieldOf(fields: Fields, key: string): unknown {
  return Object.hasOwn(fields, key) ? fields[key] : undefined;
}

function isOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isWholeNumberOrNull(value: unknown): value is number | null {
  return value === null || StoredValueUtil.wholeNumberIsAtLeast(value, 0);
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
  const crashLogNumber = ownFieldOf(value, 'crashLogNumber');
  if (!isOneOf(component, CRASHED_COMPONENTS) || !(crashLogNumber === null || StoredValueUtil.wholeNumberIsAtLeast(crashLogNumber, 1))) return undefined;
  return {
    kind, component, crashLogNumber, at
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
    && typeof field('newerHephaestusLockThanPresence') === 'boolean'
    && isOneOf(field('talos'), TALOS_EVIDENCE)
    && isTextOrNull(field('lastHeartbeatAt'))
    && isTextOrNull(field('bootStartedAt'));
}

/** A crash log stores the same classification, so its ingestion validates it here too. */
export function startClassificationOf(value: unknown): StartClassificationVerdict | null | undefined {
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
  if (!StoredValueUtil.wholeNumberIsAtLeast(inARow, 0)) return undefined;
  if (last === null) return { inARow, last: null };
  if (!JsonRecordUtil.valueIsAPlainObject(last)) return undefined;
  const reason = ownFieldOf(last, 'reason');
  const detail = ownFieldOf(last, 'detail');
  const at = ownFieldOf(last, 'at');
  if (!isOneOf(reason, ABANDONED_PASS_REASONS) || typeof detail !== 'string' || typeof at !== 'string') return undefined;
  return { inARow, last: { reason, detail, at } };
}

function presenceReadingOf(document: Fields): PresenceReading {
  const field = (key: keyof PresenceRecord): unknown => ownFieldOf(document, key);
  const unreadable = (reason: string): PresenceReading => ({ verdict: 'unreadable', reason });
  const generation = field('generation');
  const storedProcess = field('process');
  const processIdentity = storedIdentityOf(storedProcess);
  const codeVersion = field('codeVersion');
  const startOrigin = field('startOrigin');
  const startedAt = field('startedAt');
  const startClassification = startClassificationOf(field('startClassification'));
  const abandonedPasses = abandonedPassesOf(field('abandonedPasses'));
  const ending = endingOf(field('ending'));
  if (!StoredValueUtil.wholeNumberIsAtLeast(generation, 1)) return unreadable('generation is not a whole number from 1');
  if (processIdentity === null || !Object.hasOwn(storedProcess as object, 'startStamp')) return unreadable('process is not a process identity');
  if (typeof codeVersion !== 'string') return unreadable('codeVersion is not a string');
  if (!isOneOf(startOrigin, START_ORIGINS)) return unreadable('startOrigin is not a start origin');
  if (typeof startedAt !== 'string') return unreadable('startedAt is not a string');
  if (startClassification === undefined) return unreadable('startClassification is neither null nor a start classification');
  if (abandonedPasses === undefined) return unreadable('abandonedPasses is not a count with its last abandoned pass');
  if (ending === undefined) return unreadable('ending is neither null nor an ending');
  return {
    verdict: 'readable',
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

export class PresenceIngestion {
  constructor(private readonly presenceFilePath: string) {}

  /** Never throws: a record of another `presenceVersion` is unreadable, as nothing older is read. */
  read(): PresenceReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.presenceFilePath, PRESENCE_FORMAT_VERSION, PRESENCE_VERSION_KEY);
    if (stored.verdict !== 'readable') return stored;
    return presenceReadingOf(stored.document);
  }
}
