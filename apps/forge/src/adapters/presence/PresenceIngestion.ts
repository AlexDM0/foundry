/** `hephaestus/presence.json`, a generation's start, its abandoned passes and its ending: read, validate every field, map. */
import { START_KINDS, START_ORIGINS }                               from '../../domain/tracker-model/constants/JobStates.ts';
import { JsonRecordUtil }                                           from '../../lib/json-record/JsonRecordUtil.ts';
import { storedIdentityOf }                                         from '../../lib/process-identity/ProcessIdentity.ts';
import { StoredJsonDocumentUtil }                                   from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }                                          from '../utils/StoredValueUtil.ts';
import type { PresenceMalformedField, PresenceProblem }             from './@types/PresenceProblem.ts';
import type { AbandonedPassReason, PresenceEnding, PresenceRecord } from './@types/PresenceRecord.ts';
import type { StartClassificationVerdict }                          from './@types/StartClassificationVerdict.ts';
import { PRESENCE_FORMAT_VERSION }                                  from './constants/PresenceFileVersions.ts';

export type PresenceReading =
  | { verdict: 'readable'; record: PresenceRecord }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: PresenceProblem };

type Fields = Readonly<Record<string, unknown>>;

const PRESENCE_VERSION_KEY = 'presenceVersion';

const ABANDONED_PASS_REASONS = Object.keys({ 'tracker-lock-held': true, 'lock-taken-over': true } satisfies Record<AbandonedPassReason, true>) as readonly AbandonedPassReason[];

const CRASHED_COMPONENTS = ['hephaestus', 'talos'] as const;

const PREVIOUS_ENDINGS = ['stopped', 'handed-over', 'crashed'] as const;

const PRESENCE_READINGS = ['absent', 'unreadable', 'read'] as const;

const TALOS_EVIDENCE = ['none', 'quit', 'live', 'lost-this-boot', 'lost-other-boot'] as const;

function isWholeNumberOrNull(value: unknown): value is number | null {
  return value === null || StoredValueUtil.wholeNumberIsAtLeast(value, 0);
}

function endingOf(value: unknown): PresenceEnding | null | undefined {
  if (value === null) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const kind = StoredValueUtil.ownFieldOf(value, 'kind');
  const at = StoredValueUtil.ownFieldOf(value, 'at');
  if (typeof at !== 'string') return undefined;
  if (kind === 'stopped' || kind === 'handed-over') return { kind, at };
  if (kind !== 'crashed') return undefined;
  const component = StoredValueUtil.ownFieldOf(value, 'component');
  const crashLogNumber = StoredValueUtil.ownFieldOf(value, 'crashLogNumber');
  if (!StoredValueUtil.valueIsOneOf(component, CRASHED_COMPONENTS) || !(crashLogNumber === null || StoredValueUtil.wholeNumberIsAtLeast(crashLogNumber, 1))) return undefined;
  return {
    kind, component, crashLogNumber, at
  };
}

function evidenceIsWellFormed(value: unknown): boolean {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return false;
  const field = (key: keyof StartClassificationVerdict['evidence']): unknown => StoredValueUtil.ownFieldOf(value, key);
  const previousEnding = field('previousEnding');
  return StoredValueUtil.valueIsOneOf(field('presence'), PRESENCE_READINGS)
    && (previousEnding === null || StoredValueUtil.valueIsOneOf(previousEnding, PREVIOUS_ENDINGS))
    && StoredValueUtil.valueIsTextOrNull(field('previousBootIdentity'))
    && typeof field('currentBootIdentity') === 'string'
    && typeof field('newerHephaestusLockThanPresence') === 'boolean'
    && StoredValueUtil.valueIsOneOf(field('talos'), TALOS_EVIDENCE)
    && StoredValueUtil.valueIsTextOrNull(field('lastHeartbeatAt'))
    && StoredValueUtil.valueIsTextOrNull(field('bootStartedAt'));
}

/** A crash log stores the same classification, so its ingestion validates it here too. */
export function startClassificationOf(value: unknown): StartClassificationVerdict | null | undefined {
  if (value === null) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const field = (key: keyof StartClassificationVerdict): unknown => StoredValueUtil.ownFieldOf(value, key);
  const crashedComponent = field('crashedComponent');
  const wellFormed = StoredValueUtil.valueIsOneOf(field('kind'), START_KINDS)
    && isWholeNumberOrNull(field('previousGeneration'))
    && typeof field('crashSuspected') === 'boolean'
    && (crashedComponent === null || StoredValueUtil.valueIsOneOf(crashedComponent, CRASHED_COMPONENTS))
    && evidenceIsWellFormed(field('evidence'));
  return wellFormed ? value as unknown as StartClassificationVerdict : undefined;
}

function abandonedPassesOf(value: unknown): PresenceRecord['abandonedPasses'] | undefined {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return undefined;
  const inARow = StoredValueUtil.ownFieldOf(value, 'inARow');
  const last = StoredValueUtil.ownFieldOf(value, 'last');
  if (!StoredValueUtil.wholeNumberIsAtLeast(inARow, 0)) return undefined;
  if (last === null) return { inARow, last: null };
  if (!JsonRecordUtil.valueIsAPlainObject(last)) return undefined;
  const reason = StoredValueUtil.ownFieldOf(last, 'reason');
  const detail = StoredValueUtil.ownFieldOf(last, 'detail');
  const at = StoredValueUtil.ownFieldOf(last, 'at');
  if (!StoredValueUtil.valueIsOneOf(reason, ABANDONED_PASS_REASONS) || typeof detail !== 'string' || typeof at !== 'string') return undefined;
  return { inARow, last: { reason, detail, at } };
}

function presenceReadingOf(document: Fields): PresenceReading {
  const field = (key: keyof PresenceRecord): unknown => StoredValueUtil.ownFieldOf(document, key);
  const unreadable = (malformedField: PresenceMalformedField): PresenceReading => ({ verdict: 'unreadable', problem: { code: 'presence-field-malformed', field: malformedField } });
  const generation = field('generation');
  const storedProcess = field('process');
  const processIdentity = storedIdentityOf(storedProcess);
  const codeVersion = field('codeVersion');
  const startOrigin = field('startOrigin');
  const startedAt = field('startedAt');
  const startClassification = startClassificationOf(field('startClassification'));
  const abandonedPasses = abandonedPassesOf(field('abandonedPasses'));
  const ending = endingOf(field('ending'));
  if (!StoredValueUtil.wholeNumberIsAtLeast(generation, 1)) return unreadable('generation');
  if (processIdentity === null || !Object.hasOwn(storedProcess as object, 'startStamp')) return unreadable('process');
  if (typeof codeVersion !== 'string') return unreadable('codeVersion');
  if (!StoredValueUtil.valueIsOneOf(startOrigin, START_ORIGINS)) return unreadable('startOrigin');
  if (typeof startedAt !== 'string') return unreadable('startedAt');
  if (startClassification === undefined) return unreadable('startClassification');
  if (abandonedPasses === undefined) return unreadable('abandonedPasses');
  if (ending === undefined) return unreadable('ending');
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
